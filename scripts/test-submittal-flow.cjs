// Run with: node --test scripts/test-submittal-flow.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'src/components/submittal-lite/SubmittalChat.tsx'), 'utf8');
const stream = fs.readFileSync(path.join(root, 'src/lib/submittal-lite/selection-assistant-schedule.ts'), 'utf8');
function transpile(source, fileName = 'test.ts') {
  const result = ts.transpileModule(source, { fileName, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  return result.outputText;
}
const ocrContext = { exports: {} };
vm.createContext(ocrContext);
vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/submittal-lite/schedule-series.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}}).outputText, ocrContext);
const libraryContext = { exports: {} };
vm.createContext(libraryContext);
vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/submittal-lite/library.ts'), 'utf8').replace(/^import .*;$/gm, ''), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}}).outputText, libraryContext);
function declaration(name) {
  const source = ts.createSourceFile('chat.tsx', chat, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(source) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, name);
  if (name === "parsePastedIndexSections") return fs.readFileSync(path.join(root, "src/lib/submittal-lite/setup-parser.ts"), "utf8").replace(/export /g, "") + "\n" + found.getText(source);
  return ts.isVariableDeclaration(found) ? `const ${found.getText(source)};` : found.getText(source);
}
function flow(question, uploads = [], history = [], aiPlan, index = {}) {
  const calls = { applied: [], selected: [], attachments: [], messages: [] };
  const noop = () => {};
  const selection = index.selection ?? { items: [{ product: 'fan', tag: 'EF-1', airflow: 100, airflow_unit:'CMH', static_pressure: 50, pressure_unit:'Pa' }], provider: 'test' };
  const context = {
    companyOptions:index.companyOptions, brandOptions:index.brandOptions, selectedCompanyId:index.companyId, selectedBrandId:index.brandId, scheduleBranding:{}, scheduleMode:index.scheduleMode ?? "uploaded", submittalKind: index.kind ?? "Material",
    setTdsWarnings:()=>{}, sharing:false, setShareResult:()=>{},setShareError:()=>{},setShareCopied:()=>{}, completed: index.completed ?? false, freshSession: false, setCompleted: noop, setShowSavedPdf: noop, finishSubmittal: noop,
    coverDetailsText: index.cover ?? "", indexChoice: index.mode ?? null, customIndexText: index.text ?? "", uploads, input: question, busy: false, applying: false, messages: history, plan: index.plan ?? null, composePending: false, review: null, tdsWarnings: [],
    setInput: noop, setSetupOpen: noop, setBusy: noop, setMessages: fn => { calls.messages = typeof fn === "function" ? fn(calls.messages) : fn; },
    prepareUploadsForSend: async () => uploads,
    uniqueProjectDetails: fields => fields, parseSourceReferenceFields: () => [],
    readSelectionAssistantSchedule: async (text) => { calls.selected.push(text); if(index.textFails) throw Error('Selection Assistant could not read the schedule rows.'); return selection; },
    readSelectionAssistantAttachment: async (file, prompt, mode, forceVision) => { (calls.recoveryModes??=[]).push(mode); calls.recoveryMode=mode; calls.forceVision=forceVision; calls.attachments.push(file); return (mode === "openai_terra" && index.mediumFails) ? { ...selection, items: selection.items.map(item=>({...item})) } : index.recovered ?? selection; },
    makeAssistantSubmittalTds: async (items) => { calls.tdsItems=items; return ({ file: { name: 'KINAIR-Selector-TDS.pdf' }, scheduleFile: { name: 'KINAIR-Material-Schedule.pdf' }, models: ['KVF-100P'], missing: [], corrections: [] }); },
    setActiveProvider: noop, database: {}, airModels: [], airBrands: [], airSeries: [], airDimensions: [], dimensionsMap: {}, tenant: {},
    setSelectionArtifacts: noop, setUploads: noop, normalizeOcrModelCodes: ocrContext.exports.normalizeOcrModelCodes, modelCatalog: index.catalog ?? [] , loadSelectorModelCatalogue: async () => index.catalog ?? [], tenantId: 'test', seriesCatalogue: ['KVF-P'], brands: ['KINAIR'],
    detectScheduleSeries: () => ({ series: ['KVF-P'] }), inferMaterialTypes: () => ['Fan'],
    isSelectorSeries: () => true, records: [], currentRecordId: undefined, aiMode: 'auto', availableModels: [],
    supabase: { functions: { invoke: async (_name, request) => { (calls.invocations ??= []).push(request.body); return { data: request.body.action === "conversation" ? (index.conversation ?? {intent:"answer",reply:"I can explain the current checklist."}) : { plan: aiPlan } }; } } },
    setPlan: noop, setComposePending: noop, omitEmpty: false,
    inspectPlan: () => ({ sections:['Technical data sheet','Material schedule'], assignments:[], sectionStatus: [{ title: 'Technical data sheet', count: index.missing ? 0 : 1 }, { title: 'Material schedule', count: 1 }], unassignedFiles: [] }),
    autoFinish: { current: true }, setApplying: noop, confirmedCertificateMapping: false,
    onApply: async (...args) => { calls.applied.push(args); return 'assembled'; }, setOmitEmpty: noop, setConfirmedCertificateMapping: noop,
  };
  vm.createContext(context);
  vm.runInContext(transpile(declaration('submittalMessageIntent') + declaration('parseClientProjectFields') + declaration('parsePastedIndexSections') + declaration('ask') + '\nglobalThis.run = ask;'), context);
  return { calls, run: context.run };
}
test('both changed frontend files parse and transpile', () => { transpile(chat, 'chat.tsx'); transpile(stream); });
test('project-only submittal builds when library sections are complete', async () => {
  const f = flow('Build material submittal\nProject: Warehouse'); await f.run();
  assert.equal(f.calls.applied.length, 1); assert.equal(f.calls.selected.length, 0);
});
test('pasted inquiry generates selector TDS before assembly', async () => {
  const f = flow('Build material submittal\nProject: Warehouse\nFan EF-1 100 L/s 50 Pa'); await f.run();
  assert.equal(f.calls.selected.length, 1); assert.equal(f.calls.applied.length, 1);
  assert.ok(f.calls.applied[0][1].some(u => u.file.name === 'KINAIR-Selector-TDS.pdf'));
});
test('unread scanned schedule goes to original attachment reader', async () => {
  const file = { name: 'Fan Schedule.pdf' };
  const f = flow('Build submittal\nProject: Warehouse', [{ file, kind: 'support', sectionTitle: 'Material schedule', sourceRole: 'schedule', scheduleError: 'No text' }]); await f.run();
  assert.equal(f.calls.attachments.length, 1); assert.equal(f.calls.selected.length, 0); assert.equal(f.calls.applied.length, 1);
});
test('follow-up request retains earlier project fields', async () => {
  const f = flow('Build material submittal', [], [{ role: 'user', text: 'Project: Warehouse\nClient: Example' }]); await f.run();
  assert.equal(f.calls.applied.length, 1); assert.ok(f.calls.applied[0][0].fields.some(field => field.value === 'Warehouse'));
});
test('clarify response without title does not crash a build request', async () => {
  const f = flow('Build submittal', [], [], { action: 'clarify', kind: 'Material', sourceRecordId: '', product: '', brand: '', sections: [], omitSections: [], fields: [], reply: 'Missing details' }); await f.run();
  assert.equal(f.calls.applied.length, 1);
});
async function runStream({ terminalNewline = true, abort = false } = {}) {
  let timerMs, clearCount = 0, callback;
  const context = {
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } },
    window: { setTimeout: (fn, ms) => { callback = fn; timerMs = ms; return 1; }, clearTimeout: () => clearCount++ },
    crypto, AbortController, TextDecoder, console,
    fetch: async (_, options) => ({ ok: true, status: 200, headers: new Headers(), body: { getReader: () => {
      let done = false;
      return { cancel: async () => {}, read: async () => {
        if (done) return { done: true };
        done = true;
        // Simulate a tool response after nine seconds: the former timer aborts it.
        if (abort || timerMs <= 9000) callback();
        options.signal.throwIfAborted();
        const event = { type: 'tool-input-available', toolName: 'prepare_schedule_selection', input: { items: [{ product: 'fan', tag: 'EF-1' }] } };
        return { done: false, value: new TextEncoder().encode('data: ' + JSON.stringify(event) + (terminalNewline ? '\n' : '')) };
      } };
    } } }),
  };
  const source = stream.replace(/^import .*;\n/gm, '').replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, '"https://example.test"').replace(/^export /gm, '');
  vm.createContext(context); vm.runInContext(transpile(source) + '\nglobalThis.run = streamSelectionAssistant;', context);
  try { const result = await context.run([], 'Fan schedule', 'auto', false); return { result, timerMs, clearCount }; }
  catch (error) { assert.equal(clearCount, 1); throw error; }
}
test('selection stream survives responses longer than eight seconds', async () => {
  const { result, timerMs, clearCount } = await runStream(); assert.equal(result.items.length, 1); assert.equal(timerMs, 120000); assert.equal(clearCount, 1);
});
test('last SSE frame is read without trailing newline', async () => { assert.equal((await runStream({ terminalNewline: false })).result.items.length, 1); });
test('timeout reports an actionable error and clears timer', async () => { await assert.rejects(runStream({ abort: true }), /timed out while reading the schedule/); });

test('explicit project index wins over old custom-index history', async () => {
  const f = flow('Build submittal\nProject: Warehouse', [], [{role:'user',text:'Use Custom Index'}], undefined, {mode:'project'}); await f.run();
  assert.equal(f.calls.applied[0][0].indexMode, 'project'); assert.equal(f.calls.applied[0][0].explicitIndexMode, true);
});
test('short pasted custom index retains exact headings and order', async () => {
  const f = flow('Build submittal\nProject: Warehouse', [], [], undefined, {mode:'customer',text:'1. Certificates\n2. Equipment data'}); await f.run();
  assert.deepEqual(Array.from(f.calls.applied[0][0].sections), ['Certificates','Equipment data']);
});
test('custom mode asks for missing index before assembly', async () => {
  const f = flow('Build submittal', [], [], undefined, {mode:'customer'}); await f.run();
  assert.equal(f.calls.applied.length,0); assert.match(f.calls.messages[0].text,/paste your custom index/);
});
test('explicit general index wins over an attached project specification', async () => {
  const f = flow('Build submittal\nProject: Warehouse', [{file:{name:'spec.pdf'},kind:'support',sectionTitle:'Project Specification',documentText:'Specification'}], [], undefined, {mode:'general'}); await f.run();
  assert.equal(f.calls.applied[0][0].indexMode,'general');
});

test('dedicated cover paste works without a chat message and preserves custom labels', async () => {
  const f = flow('', [], [], undefined, {mode:'general',cover:'Project: Warehouse\nConsultant: XYZ\nTender Reference: T-123'}); await f.run();
  assert.equal(f.calls.applied.length,1);
  assert.ok(f.calls.applied[0][0].fields.some(x=>x.label==='Consultant'&&x.value==='XYZ'));
  assert.ok(f.calls.applied[0][0].fields.some(x=>x.label==='Tender Reference'&&x.value==='T-123'));
});

test('second project does not inherit the completed project client', async () => {
 const f = flow('Build material submittal\nProject: New Warehouse', [], [{role:'user',text:'Build submittal\nProject: Old Warehouse\nClient: Old Client'}], undefined, {completed:true}); await f.run();
 assert.equal(f.calls.applied.length,1);
 assert.ok(f.calls.applied[0][0].fields.some(x=>x.value==='New Warehouse'));
 assert.ok(!f.calls.applied[0][0].fields.some(x=>x.value==='Old Client'));
});
test('New submittal clears project setup, files, result and picker values', () => {
 const state = {};
 const refs = [{current:{value:'old.pdf'}},{current:{value:'cover.pdf'}},{current:{value:'index.pdf'}}];
 const ctx = {completed:false,onRestart:undefined,sharing:false,setShareResult:()=>{},setShareError:()=>{},setShareCopied:()=>{},busy:false,applying:false,readingUploads:0,autoFinish:{current:false},uploadInputRef:refs[0],coverUploadRef:refs[1],targetedUploadRef:refs[2]};
 for(const key of ['TdsWarnings','ScheduleMode','SubmittalKind','Input','Messages','Plan','Uploads','CoverDetailsText','CustomIndexText','IndexChoice','SelectionArtifacts','ActiveProvider','OmitEmpty','ConfirmedCertificateMapping','ComposePending','Completed','ShowSavedPdf','FreshSession','SetupOpen']) ctx['set'+key] = value => {state[key]=value;};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('startNewSubmittal')+'\nglobalThis.run=startNewSubmittal;'),ctx);ctx.run();
 assert.equal(state.CoverDetailsText,'');assert.equal(state.CustomIndexText,'');assert.equal(state.IndexChoice,'general');assert.equal(state.Uploads.length,0);assert.equal(state.Messages.length,0);assert.equal(state.ShowSavedPdf,false);assert.equal(state.SetupOpen,true);assert.ok(refs.every(r=>r.current.value===''));
});

for (const kind of ['Material', 'PQ', 'O&M']) test(`${kind} selection reaches core builder`, async () => {
 const f = flow('', [], [], undefined, {kind, cover:'Project: Warehouse'}); await f.run();
 assert.equal(f.calls.applied.length,1); assert.equal(f.calls.applied[0][0].kind,kind);
});
for (const readable of [true,false]) test(`quotation original stays excluded with ${readable?'text':'fallback'} reader`,async()=>{
 const file={name:'offer.pdf',type:'application/pdf'};
 const uploads=[{file,uploadPurpose:'Quotation',excludeFromPdf:true}];
 const ctx={scheduleMode:'uploaded',uploads,modelCatalog:[{}],mobileMode:false,aiMode:'auto',window:{matchMedia:()=>({matches:false}),setTimeout:()=>0},navigator:{userAgent:''},
 setReadingUploads:()=>{},setUploads:()=>{},isSpreadsheet:()=>false,pdfToText:async()=>readable?'Quotation Unit Price AED 1000 KVF-100P Airflow 100 CMH Pressure 50 Pa '.repeat(3):'',
 extractTextAdvanced:async()=>{throw Error('OCR unavailable');},readScannedPage:()=>{},probeSelectionAssistantSchedule:async()=>({items:[{}]}),
 readSelectionAssistantAttachment:async()=>({items:[{tag:'EF-1',product:'fan',existing_selection:'KVF-100P'}]})};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('isQuotationText')+declaration('classifyUpload')+declaration('prepareUploadsForSend')+'\nglobalThis.run=prepareUploadsForSend;'),ctx);
 const result=await ctx.run();assert.equal(result[0].excludeFromPdf,true);assert.equal(result[0].sourceRole,'quotation');assert.ok(result[0].scheduleText);
});
test('share uploads an immutable PDF and requests exactly seven days',async()=>{
 const source=fs.readFileSync(path.join(root,'src/lib/submittal-lite/share.ts'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
 const calls=[];const ctx={URL,window:{location:{origin:"https://www.ventilation4u.com"}},crypto:{randomUUID:()=> 'snapshot-1',subtle:require('node:crypto').webcrypto.subtle},TextEncoder,File,Uint8Array,Date,
 uploadSubmittalFile:async(key,file)=>calls.push({key,file}),
 supabase:{storage:{from:bucket=>({createSignedUrl:async(key,seconds)=>{calls.push({bucket,key,seconds});return {data:{signedUrl:'https://example.test/signed?token=test-token'}};}})}}};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(source)+'\nglobalThis.run=shareSubmittalPdf;globalThis.remember=rememberSubmittalShare;globalThis.cached=cachedSubmittalShare;',ctx);
 ctx.remember('tenant-1','expired',{url:'https://www.ventilation4u.com/kinair-submittal#old',expiresAt:new Date(Date.now()-1000).toISOString()}); assert.equal(ctx.cached('tenant-1','expired'),undefined);
 const result=await ctx.run('tenant-1',new Uint8Array([37,80,68,70]));
 const again=await Promise.all([ctx.run('tenant-1',new Uint8Array([37,80,68,70])),ctx.run('tenant-1',new Uint8Array([37,80,68,70]))]); assert.equal(calls.length,2); assert.equal(again[0].url,result.url);
 await Promise.all([ctx.run('tenant-1',new Uint8Array([1,2])),ctx.run('tenant-1',new Uint8Array([1,2]))]); assert.equal(calls.length,4);
 assert.equal(calls[1].seconds,604800);assert.equal(calls[1].key,'tenant-1/lite-builder/shares/snapshot-1/Submittal.pdf');assert.equal(result.url,'https://www.ventilation4u.com/kinair-submittal?preview=2#test-token');
});

test('quotation title and payment terms without prices are not a priced quotation',()=>{
 const ctx={};Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('isQuotationText')+'\nglobalThis.check=isQuotationText;'),ctx);
 assert.equal(ctx.check('Quotation Q123\nUnit Price\nKVF-100P Qty 2\nPayment terms: 50% advance\nValidity 30 days'),false);
 assert.equal(ctx.check('Unit Price: 1500'),true);assert.equal(ctx.check('FM-4518-L Qty 2 AED 1500'),true);
});
for (const mode of ['uploaded','ai']) test(`unpriced quotation follows ${mode} schedule choice`,async()=>{
 const file={name:'quotation.pdf',type:'application/pdf'}; const uploads=[{file,uploadPurpose:'Quotation',excludeFromPdf:true}];
 const ctx={scheduleMode:mode,uploads,modelCatalog:[{}],mobileMode:false,aiMode:'auto',window:{matchMedia:()=>({matches:false}),setTimeout:()=>0},navigator:{userAgent:''},setReadingUploads:()=>{},setUploads:()=>{},isSpreadsheet:()=>false,pdfToText:async()=> 'Quotation Material Schedule KVF-100P Qty 2 Airflow 100 CMH ESP 50 Pa Payment terms: advance. '.repeat(3),probeSelectionAssistantSchedule:async()=>({items:[{}]})};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('isQuotationText')+declaration('classifyUpload')+declaration('prepareUploadsForSend')+'\nglobalThis.run=prepareUploadsForSend;'),ctx);
 const [result]=await ctx.run();assert.equal(result.sourceRole,'schedule');assert.equal(result.excludeFromPdf,mode==='ai');assert.equal(result.sectionTitle,mode==='uploaded'?'Material schedule':'');
});

test('successful cloud upload resolves even when IndexedDB cache is blocked',async()=>{
 const source=fs.readFileSync(path.join(root,'src/lib/submittal-lite/idb.ts'),'utf8').replace(/^import .*;$/gm,'').replace(/import\.meta\.env\.VITE_SUPABASE_URL/g,'"https://example.supabase.co"');
 const calls=[];const ctx={exports:{},require:()=>({}),Uint8Array,indexedDB:{open:()=>({})},supabase:{storage:{from:()=>({upload:async(path)=>{calls.push(path);return {error:null};}})}}};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(source.replace(/export /g,''))+'\nglobalThis.exports={setSubmittalStorageTenantId,idbSet};',ctx);
 ctx.exports.setSubmittalStorageTenantId('tenant-1');
 await Promise.race([ctx.exports.idbSet('shares/test.pdf',new Uint8Array([37,80,68,70]).buffer,'application/pdf'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Upload blocked on optional cache')),100))]);
 assert.equal(calls[0],'tenant-1/lite-builder/shares/test.pdf');
});

test('equipment schedule location is not promoted to the project cover',async()=>{
 const result=await flow('Project Name: Warehouse in Al Quoz\nClient: XYZ Properties\nBuild submittal',[{file:{name:'fans.pdf'},kind:'support',sectionTitle:'Material schedule',scheduleText:'Location: Roof\nKVF-100P Qty 1'}]);
 await result.run(); assert.ok(result.calls.applied.length);assert.equal(result.calls.applied[0][0].fields.some(x=>x.label==='Location'),false);
});

test('missing air curtain dimensions trigger original-file recovery without changing quantity',async()=>{
 const selection={items:[{product:'air_curtain',tag:'Door-1',quantity:2,existing_selection:'FM-1215N-2(Y)'}],provider:'test'};
 const recovered={items:[{...selection.items[0],quantity:99,door_width:2864,door_width_unit:'mm',door_height:2.862,door_height_unit:'m'}],provider:'test'};
 const f=flow('Project Name: Warehouse\nBuild submittal',[{file:{name:'schedule.pdf'},kind:'support',sourceRole:'schedule',sectionTitle:'Material schedule',scheduleText:'Door-1 FM-1215N-2(Y)'}],[],undefined,{selection,recovered});
 await f.run();assert.equal(f.calls.attachments.length,1);assert.equal(f.calls.tdsItems[0].door_width,2864);assert.equal(f.calls.tdsItems[0].quantity,2);assert.equal(f.calls.recoveryMode,"openai_terra");assert.deepEqual(f.calls.recoveryModes,["openai_terra"]);assert.equal(f.calls.forceVision,true);
});

test('quality recovery sends page images even for a searchable PDF',async()=>{
 const ast=ts.createSourceFile('reader.ts',stream,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name.text==='callSelectionAssistantAttachmentOnce');
 let received;
 const ctx={isSpreadsheet:()=>false,isPdf:()=>true,pdfToText:async()=> 'Readable table text '.repeat(30),pdfToImages:async()=>['data:image/png;base64,ABC'],toBase64Payload:x=>x,
 streamSelectionAssistant:async(parts,hint,mode)=>{received={parts,mode};return {items:[]};}};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(fn.getText(ast))+'\nglobalThis.run=callSelectionAssistantAttachmentOnce;',ctx);
 await ctx.run({name:'ACU Schedule.pdf'},'Recover dimensions','openai_sol',false,true);
 assert.equal(received.mode,'openai_sol');assert.ok(received.parts.some(p=>p.type==='file'&&p.mediaType==='image/png'));
});

 test('premium recovery runs only after medium leaves required fields unresolved',async()=>{
 const selection={items:[{product:'air_curtain',tag:'Door-1',quantity:2,existing_selection:'FM-1215N-2(Y)'}],provider:'test'};
 const recovered={items:[{...selection.items[0],door_width:2864,door_width_unit:'mm',door_height:2.862,door_height_unit:'m'}],provider:'test'};
 const f=flow('Project Name: Warehouse\nBuild submittal',[{file:{name:'schedule.pdf'},kind:'support',sourceRole:'schedule',sectionTitle:'Material schedule',scheduleText:'Door-1 FM-1215N-2(Y)'}],[],undefined,{selection,recovered,mediumFails:true});
 await f.run();assert.deepEqual(f.calls.recoveryModes,['openai_terra','openai_sol']);assert.equal(f.calls.tdsItems[0].door_width,2864);
 });

 test('completed chat restarts even while an old share is pending',()=>{
 let restarted=false;const ctx={completed:true,busy:true,applying:true,readingUploads:1,sharing:true,onRestart:()=>{restarted=true;}};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('startNewSubmittal')+'\nglobalThis.run=startNewSubmittal;'),ctx);ctx.run();assert.equal(restarted,true);
 });
 test('attaching the next project restarts with its files and typed details',()=>{
 let seed;const file={name:'same.pdf',type:'application/pdf'};const ctx={completed:true,onRestart:value=>{seed=value},input:'New project',coverDetailsText:'Project Name: Second',customIndexText:'',indexChoice:'general',submittalKind:'Material',scheduleMode:'uploaded'};
 Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('addFiles')+'\nglobalThis.run=addFiles;'),ctx);ctx.run([file]);assert.equal(seed.uploads.length,1);assert.equal(seed.uploads[0].file,file);assert.equal(seed.coverDetailsText,'Project Name: Second');assert.equal(seed.input,'New project');
 });

test('custom index removes old page numbers and preserves all fourteen headings',()=>{
 const input=`1 COMPANY PROFILE 3
2 MATERIAL SCHEDULE 9
3 PRODUCT CATALOGUE 10
4 TECHNICAL DATA SHEET 13
5 PROJECT SPECIFICATION 14
6 COMPLIANCE STATMENT 15
7 TEST REPORTS & TEST CERTIFICATE 17
8 COUNTRY OF ORIGIN 20
9 INSTALLATION GUIDE 22
10 DRAFT WARRANTY 23
11 PROJECT REFERNCE LIST/PREVIOUS PROJECT APPROVALS 25
12 MANUFACTURER'S AUTHORIZATION LETTER 29
13 VALID TRADE CERTIFICATE 30
14 VALID ISO CERTIFICATE 31`;
 const ctx={};Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('parsePastedIndexSections')+'\nglobalThis.run=parsePastedIndexSections;'),ctx);
 const result=ctx.run(input);assert.equal(result.length,14);assert.equal(result[5],'COMPLIANCE STATMENT');assert.equal(result[12],'VALID TRADE CERTIFICATE');assert.ok(result.every(x=>!/[0-9]$/.test(x)));
});
test('specification compliance and TDS headings outrank fan duty words',()=>{
 const ctx={};Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(transpile(declaration('classifyUpload')+'\nglobalThis.run=classifyUpload;'),ctx);
 for(const [heading,section] of [['PROJECT SPECIFICATION','Project specification'],['COMPLIANCE STATMENT','Compliance statement'],['TECHNICAL DATA SHEET','Technical data sheet']]){
 const result=ctx.run({name:'document.pdf'},heading+'\nModel KVF-100P Airflow 25 L/s ESP 100 Pa Quantity 5');assert.equal(result.sectionTitle,section);assert.equal(result.isSchedule,false);
 }
});
test('custom headings map to saved library categories without mixing certificates',()=>{
 const source=fs.readFileSync(path.join(root,'src/lib/submittal-lite/library.ts'),'utf8').replace(/^import .*;$/gm,'');const ctx={exports:{}};Object.assign(ctx, { indexHeadingIntent: libraryContext.exports.indexHeadingIntent });vm.createContext(ctx);vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}}).outputText,ctx);
 const match=(heading,category)=>ctx.exports.matches(heading,{id:'1',name:category+'.pdf',type:'application/pdf',category});
 assert.ok(match('VALID TRADE CERTIFICATE','Trade License'));assert.ok(match('COMPLIANCE STATMENT','Compliance Statement'));assert.ok(match("MANUFACTURER'S AUTHORIZATION LETTER",'Manufacturer Authorization Letter'));assert.ok(match('INSTALLATION GUIDE','O&M Manual'));assert.ok(match('PROJECT REFERNCE LIST/PREVIOUS PROJECT APPROVALS','Project Reference List'));
 assert.equal(match('VALID TRADE CERTIFICATE','ISO Certificate'),false);assert.equal(match('TEST REPORTS & TEST CERTIFICATE','Trade License'),false);
});

test('all curated training headings map with punctuation case spacing and file extensions', () => {
 const {indexTrainingAliases,indexHeadingIntent}=libraryContext.exports;
 for(const [type, aliases] of Object.entries(indexTrainingAliases)) for(const alias of aliases) {
   assert.equal(indexHeadingIntent(alias),type,alias);
   assert.equal(indexHeadingIntent(alias.toUpperCase().replace(/ /g,' - ') + '.pdf'),type,alias);
 }
});
test('general compliance cannot satisfy a project-specific compliance section', () => {
 const {matches}=libraryContext.exports;
 const doc=name=>({id:'1',name,category:'Compliance Statement',type:'application/pdf'});
 assert.equal(matches('Project Compliance Statement',doc('General Compliance Statement.pdf')),false);
 assert.equal(matches('Clause-by-Clause Compliance',doc('Compliance Statement.pdf')),false);
 assert.equal(matches('General Compliance Statement',doc('Project Compliance Statement.pdf')),false);
 assert.equal(matches('Specification Compliance',doc('Project Compliance Statement.pdf')),true);
});
test('training headings identify technical documents before schedule heuristics',()=>{
 const ctx={indexHeadingIntent:libraryContext.exports.indexHeadingIntent};vm.createContext(ctx);
 vm.runInContext(transpile(declaration('classifyUpload')+'\nglobalThis.run=classifyUpload;'),ctx);
 for(const heading of ['Performance Data','Technical Specification Sheet','Product Datasheet','Tech Data Sheet']) {
 const result=ctx.run({name:'upload.pdf'},heading+'\nModel KVF-100P Airflow 25 L/s ESP 100 Pa Qty 5');
 assert.equal(result.sectionTitle,'Technical data sheet',heading);assert.equal(result.isSchedule,false);
 }
});

test('custom index using alternative headings remains an index upload',()=>{
 const ctx={indexHeadingIntent:libraryContext.exports.indexHeadingIntent};vm.createContext(ctx);
 vm.runInContext(transpile(declaration('classifyUpload')+'\nglobalThis.run=classifyUpload;'),ctx);
 const result=ctx.run({name:'upload.pdf'},'1 Corporate Introduction 3\n2 Equipment List 6\n3 Product Literature 8\n4 Performance Data 12\n5 Business License 14\n6 QMS Certificate 17');
 assert.equal(result.kind,'index');assert.equal(result.isSchedule,false);
});

test('additional training aliases attach to their own document categories only',()=>{
 const {indexTrainingAliases,matches}=libraryContext.exports;
 const categories={manual:'O&M Manual',origin:'Country of Origin',authorization:'Manufacturer Authorization Letter'};
 for(const [type,category] of Object.entries(categories)) for(const heading of indexTrainingAliases[type]) {
   assert.equal(matches(heading,{id:'1',name:category+'.pdf',category,type:'application/pdf'}),true,heading);
   for(const wrong of ['Trade License','ISO Certificate','Technical Data Sheet'])
     assert.equal(matches(heading,{id:'1',name:wrong+'.pdf',category:wrong,type:'application/pdf'}),false,heading+' vs '+wrong);
 }
});
test('additional upload headings use content context and stay out of schedules',()=>{
 const ctx={indexHeadingIntent:libraryContext.exports.indexHeadingIntent};vm.createContext(ctx);
 vm.runInContext(transpile(declaration('classifyUpload')+'\nglobalThis.run=classifyUpload;'),ctx);
 for(const [heading,body,title] of [
   ['IOM','Mount the unit securely before wiring.','Installation guide'],
   ['COO','We declare the country of manufacture.','Country of origin'],
   ['MAF','The manufacturer authorizes this distributor.','Manufacturer authorization letter'],
   ['Authorised Dealer Letter','Authorized representation.','Manufacturer authorization letter'],
 ]) {
 const result=ctx.run({name:'upload.pdf'},heading+'\n'+body+'\nModel KVF-100P Airflow 25 L/s ESP 100 Pa');
 assert.equal(result.sectionTitle,title,heading);assert.equal(result.isSchedule,false);
 }
 assert.notEqual(ctx.run({name:'upload.pdf'},'Appointment Letter\nYou are appointed as accountant in our HR department.').sectionTitle,'Manufacturer authorization letter');
 assert.notEqual(ctx.run({name:'upload.pdf'},'COO\nChief operating officer contact details.').sectionTitle,'Country of origin');
});

test('missing index documents pause assembly and ask for upload or manual builder',async()=>{
 const f=flow('Build material submittal\nProject: Warehouse',[],[],undefined,{missing:true});await f.run();
 assert.equal(f.calls.applied.length,0);
 assert.ok(f.calls.messages.some(m=>m.text.includes('Please upload the missing documents for: Technical data sheet') && m.text.includes('manual builder')));
});
async function semanticCheck(responses, mode='auto') {
 const edge=fs.readFileSync(path.join(root,'supabase/functions/submittal-assistant/index.ts'),'utf8');
 const start=edge.indexOf('    if (payload.action === "match_sections")');const end=edge.indexOf('    const documents = Array.isArray(payload.documents)',start);
 const shape={max(){return this},min(){return this},parse(x){return x}};
 const calls=[];const doc={id:'0',filename:'evidence.pdf',intent:'',text:'This statement confirms the factory country of production as UAE.'};
 const ctx={Response,AbortSignal,console,headers:{},mode,keys:{openai:'test'},models:['cheap','balanced','premium'].map((tier,i)=>({provider:'openai',tier,model_id:tier,cost_rank:i})),
 payload:{action:'match_sections',sections:[{title:'Country of Origin',intent:'origin'}],documents:[doc]},
 z:{array:()=>shape,object:()=>shape,string:()=>shape,number:()=>shape},createOpenAI:()=>name=>name,
 generateObject:async args=>{calls.push(args.model);return {object:{matches:responses[calls.length-1]??[]}}}};
 vm.createContext(ctx);vm.runInContext(transpile('async function run(){'+edge.slice(edge.indexOf('    const tierCandidates ='),edge.indexOf('    const modelCandidates ='))+edge.slice(start,end)+'}\nglobalThis.run=run;'),ctx);
 return {calls,result:await (await ctx.run()).json()};
}
test('semantic fallback escalates cheap to balanced and stops after evidenced match',async()=>{
 const good={id:'0',section:'Country of Origin',confidence:.97,evidence:'factory country of production'};
 const r=await semanticCheck([[{...good,confidence:.6}],[good]]);
 assert.deepEqual(r.calls,['cheap','balanced']);assert.equal(r.result.matches.length,1);
});
test('semantic fallback rejects invented sections and evidence; local mode makes no calls',async()=>{
 const bad={id:'0',section:'Invented divider',confidence:1,evidence:'factory country of production'};
 const r=await semanticCheck([[bad],[{...bad,section:'Country of Origin',evidence:'invented evidence'}],[]]);
 assert.equal(r.result.matches.length,0);
 const local=await semanticCheck([], 'local');assert.equal(local.calls.length,0);
});
test('project index cannot auto-attach shared general compliance to a generic compliance divider',()=>{
 const page=fs.readFileSync(path.join(root,'src/pages/SubmittalControlPage.tsx'),'utf8');
 const ast=ts.createSourceFile('page.tsx',page,99,true,ts.ScriptKind.TSX);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='attach');
 const ctx={matches:libraryContext.exports.matches,indexHeadingIntent:libraryContext.exports.indexHeadingIntent,isComplianceStatement:x=>/compliance/i.test(x),logicalFileNameKey:x=>x.toLowerCase()};vm.createContext(ctx);
 vm.runInContext(transpile(fn.getText(ast))+'\nglobalThis.run=attach;',ctx);
 const general={id:'g',name:'General Compliance Statement.pdf',category:'General Compliance Statement',type:'application/pdf'};
 const project={id:'p',name:'Project Compliance Statement.pdf',category:'Compliance Statement',type:'application/pdf'};
 const sections=[{id:'s',title:'Project Specification',docs:[]},{id:'c',title:'Compliance Statement',docs:[]}];
 const result=ctx.run(sections,[general,project]);assert.deepEqual(Array.from(result[1].docs,d=>d.id),['p']);
 assert.equal(ctx.run([{id:'g',title:'General Compliance Statement',docs:[]}],[general])[0].docs.length,1);
});

test('ordinary questions use conversation and never assemble a PDF', async () => {
 const f=flow('How does the custom index work?'); await f.run();
 assert.equal(f.calls.invocations[0].action,'conversation');
 assert.equal(f.calls.applied.length,0); assert.equal(f.calls.selected.length,0);
 assert.match(f.calls.messages.at(-1).text,/explain/);
});
test('reported missing TDS retries source selection and waits for review', async () => {
 const existing={action:'create',kind:'Material',title:'Warehouse',product:'KVF-P',fields:[],sections:['Technical data sheet','Material schedule'],indexMode:'customer',omitSections:[],reply:''};
 const f=flow('TDS is missing, please fix it', [{file:{name:'schedule.pdf'},kind:'support',sectionTitle:'Material schedule',scheduleText:'KVF-100P Airflow 100 CMH ESP 50 Pa',selectionItems:[{product:'fan',existing_selection:'KVF-100P'}]}], [], undefined, {plan:existing,completed:true});
 await f.run(); assert.ok(f.calls.tdsItems?.length); assert.equal(f.calls.applied.length,0);
 assert.ok(f.calls.messages.some(m=>/recheck/i.test(m.text)));
});
test('completed submittal retains source files for follow-up repairs', () => {
 const source=declaration('finishSubmittal');
 assert.doesNotMatch(source,/setUploads\(\[\]\)|setPlan\(null\)|setCustomIndexText\(""\)/);
 assert.match(declaration('startNewSubmittal'),/setUploads\(\[\]\)/);
});

async function conversationCheck(mode='auto',gemini=false) {
 const edge=fs.readFileSync(path.join(root,'supabase/functions/submittal-assistant/index.ts'),'utf8');
 const start=edge.indexOf('    if (payload.action === "conversation")');const end=edge.indexOf('    if (payload.action === "match_sections")',start);
 const shape={max(){return this},min(){return this}};const calls=[];
 const ctx={Response,AbortSignal,console:{warn(){}},headers:{},mode,keys:{openai:'test'},models:['cheap','balanced','premium'].map((tier,i)=>({provider:'openai',tier,model_id:tier,cost_rank:i})),
 payload:{action:'conversation',checklist:{sectionStatus:[{title:'Trade license',count:0}]}},message:'Why is the license missing?',history:[],draftPlan:null,
 z:{enum:()=>shape,object:()=>shape,string:()=>shape},createOpenAI:()=>name=>name,
 generateObject:async args=>{calls.push(args.model);if(calls.length===1)throw Error('provider down');return {object:{intent:'repair',reply:'I will recheck the license match.'}}}};
 if(gemini){ctx.keys.gemini='test';ctx.models.push({provider:'google',tier:'free',model_id:'gemini-flash-lite-latest',cost_rank:0});ctx.createGoogleGenerativeAI=()=>name=>name;}
 vm.createContext(ctx);vm.runInContext(transpile('async function run(){'+edge.slice(edge.indexOf('    const tierCandidates ='),edge.indexOf('    const modelCandidates ='))+edge.slice(start,end)+'}\nglobalThis.run=run;'),ctx);
 return {calls,result:await (await ctx.run()).json()};
}
test('conversation falls back one tier after failure and returns repair intent',async()=>{
 const r=await conversationCheck();assert.deepEqual(r.calls,['cheap','balanced']);assert.equal(r.result.intent,'repair');
});
test('local-only conversation exposes missing divider without cloud calls',async()=>{
 const r=await conversationCheck('local');assert.equal(r.calls.length,0);assert.match(r.result.reply,/Trade license/);
});

test('company certificates join the test package across products, without changing category',()=>{
 for (const [name,category] of [['AMCA Member Plaque.pdf','Membership Certificate'],['TUV Fire Test.pdf','Product Certificate'],['Fire testing.pdf','Test Certificate'],['ISO-KME.pdf','ISO Certificate']]) {
   const doc={id:'c',name,category,libraryScope:'company'};
   assert.equal(libraryContext.exports.matches('TEST REPORTS & TEST CERTIFICATES',doc),true,name);
   assert.equal(libraryContext.exports.matches('Certificates',doc),true,name);
   assert.equal(doc.category,category);
 }
 assert.equal(libraryContext.exports.matches('Test Certificate',{name:'AMCA Member Plaque.pdf',category:'Membership Certificate'}),false);
 assert.equal(libraryContext.exports.matches('Trade License',{name:'TUV Fire Test.pdf',category:'Product Certificate',libraryScope:'company'}),false);
});
test('chat stops preparation until supplier and brand are selected',async()=>{
 const f=flow('Build submittal\nProject: New',[],[],undefined,{companyOptions:[{id:'c',name:'Kinetics'}],brandOptions:[{id:'b',name:'KINAIR'}],companyId:'c'});
 await f.run();assert.equal(f.calls.applied.length,0);assert.match(f.calls.messages.at(-1).text,/select the supplier company and brand/);
});
test('chat plan uses explicit company and brand IDs',async()=>{
 const f=flow('Build submittal\nProject: New',[],[],undefined,{companyOptions:[{id:'c',name:'Kinetics'}],brandOptions:[{id:'b',name:'Selected Brand'}],companyId:'c',brandId:'b'});
 await f.run();assert.equal(f.calls.applied.length,1);const plan=f.calls.applied[0][0];assert.equal(plan.companyId,'c');assert.equal(plan.brandId,'b');assert.equal(plan.brand,'Selected Brand');
});

test('Gemini limit uses Luna before any higher-cost tier',async()=>{const r=await conversationCheck('auto',true);assert.deepEqual(r.calls,['gemini-flash-lite-latest','cheap']);assert.equal(r.result.intent,'repair');});

test('OCR correction reaches TDS with the unique catalogue model and preserves tag', async()=>{const f=flow('Build material submittal\nProject: Warehouse\nFan 100 L/s 50 Pa',[],[],undefined,{catalog:[{code:'KVF-150P',series:'KVF-P'}],selection:{provider:'test',items:[{product:'fan',tag:'KEF-01',existing_selection:'KEF-150P',airflow:100,airflow_unit:'L/s',static_pressure:50,pressure_unit:'Pa'}]}});await f.run();assert.equal(f.calls.tdsItems[0].existing_selection,'KVF-150P');assert.equal(f.calls.tdsItems[0].tag,'KEF-01');});
test('valid catalogue KEF model is never replaced with KVF',()=>{assert.equal(ocrContext.exports.normalizeOcrModelCodes('KEF-150P',[{code:'KEF-150P'},{code:'KVF-150P'}]),'KEF-150P');});

test('failed text schedule reading retries original visually before TDS',async()=>{const f=flow('Build material submittal\nProject: Warehouse',[{file:{name:'fan schedule.pdf'},sectionTitle:'Material schedule',sourceRole:'schedule',scheduleText:'Unreadable table text'}],[],undefined,{textFails:true});await f.run();assert.equal(f.calls.forceVision,true);assert.ok(f.calls.tdsItems.length);assert.equal(f.calls.applied.length,1);});

function recoveryReader() {
  const ast=ts.createSourceFile('reader.ts',stream,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='recoverScheduleRead');
  const ctx={Error}; vm.createContext(ctx);
  vm.runInContext(transpile(fn.getText(ast))+'\nglobalThis.run=recoverScheduleRead;',ctx);return ctx.run;
}
test('empty Gemini extraction retries cheap OpenAI and stops on rows',async()=>{
  const calls=[];const result=await recoveryReader()('auto',false,async mode=>{calls.push(mode);return mode==='gemini'?null:{items:[{product:'fan',existing_selection:'KVF-150P'}],provider:'OpenAI'};});
  assert.deepEqual(calls,['gemini','openai_luna']);assert.equal(result.items[0].existing_selection,'KVF-150P');
});
test('failed and empty reads escalate through medium and premium',async()=>{
  const calls=[];await recoveryReader()('auto',false,async mode=>{calls.push(mode);if(mode==='gemini')throw Error('HTTP 429');return mode==='openai_sol'?{items:[{product:'fan'}],provider:'OpenAI'}:{items:[]};});
  assert.deepEqual(calls,['gemini','openai_luna','openai_terra','openai_sol']);
});
test('all failed tiers return attempt reasons instead of silent TDS omission',async()=>{
  await assert.rejects(recoveryReader()('auto',false,async()=>null),/openai_sol: no readable equipment rows/);
});
test('classification probes do not spend on premium for non-schedule documents',async()=>{
  const calls=[];assert.equal(await recoveryReader()('auto',true,async mode=>{calls.push(mode);return null;}),null);assert.deepEqual(calls,['gemini']);
});
test('authentication failure stops retrying providers',async()=>{
  const calls=[];await assert.rejects(recoveryReader()('auto',false,async mode=>{calls.push(mode);throw Error('Selection Assistant returned HTTP 401.');}),/401/);assert.deepEqual(calls,['gemini']);
});
