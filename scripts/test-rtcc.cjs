const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {splitConsultantComments,parsePageSelection,localRtccReply,validateEvidence,rtccReady}=require('../src/lib/submittal-lite/rtcc.ts');
const {buildSubmittalPdf}=require('../src/lib/submittal-lite/pdf-build.ts');
const {PDFDocument}=require('pdf-lib');
test('all bullets survive; approval form labels do not become comments',()=>{
 const source='CONSULTANT COMMENTS: Approved As Noted\n* First comment * Second comment\n continued\n ENGINEERS\'/RE REVIEW:\nCode 1 no comments';
 assert.deepEqual(splitConsultantComments(source),['First comment','Second comment continued']);
});
test('page range validation and deduplication',()=>{assert.deepEqual(parsePageSelection('1-3,2,5',5),[0,1,2,4]);assert.throws(()=>parsePageSelection('0',4));assert.throws(()=>parsePageSelection('3-8',4));});
test('technical performance does not get blind comply or contractor dismissal',()=>{assert.equal(localRtccReply('Noise shall not exceed 35 NC').reply,'');assert.equal(localRtccReply('Fans certified AMCA').reply,'');assert.equal(localRtccReply('Provide access panels').responsibility,'Contractor');});
test('evidence must quote an existing document; incomplete reviews blocked',()=>{assert.equal(validateEvidence([{docId:'a',quote:'IEC 60335 standard'}],[{id:'a',text:'Meets IEC 60335 standard.'}]).length,1);assert.equal(validateEvidence([{docId:'b',quote:'IEC 60335 standard'}],[{id:'a',text:'IEC 60335 standard'}]).length,0);assert.equal(rtccReady([{rows:[{comment:'A',reply:'',reviewed:true}]}]),false);});
test('latest RTCC first, evidence references actual final pages, long replies paginate',async()=>{
 const support=await PDFDocument.create();support.addPage();const bytes=await support.save();
 const row={id:'r',comment:'Provide the offered construction.',reply:'Please refer to the attached technical data.',responsibility:'Supplier',reviewed:true,evidence:[{docId:'tds',quote:'Powder coated steel casing'}]};
 const input={kindLabel:'Material Submittal',title:'Warehouse',fields:[{label:'Project',value:'Warehouse'}],sections:[{title:'Technical data sheet',files:[{id:'tds',name:'tds.pdf',type:'application/pdf',bytes:bytes.buffer}]}],templates:{},stampEveryPage:false,rtcc:[{id:'old',number:1,date:'2026-09-28',sourceText:'',rows:[row]},{id:'new',number:2,date:'2026-09-28',sourceText:'',rows:[{...row,reply:('An engineer reviewed response with its supporting reference. ').repeat(300)}]}]};
 const result=await buildSubmittalPdf(input);assert.match(result.labels[0].label,/RTCC 02/);assert.ok(result.labels.length>6);
 const pdfjs=await import(path.resolve(__dirname,'../../check-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs'));
 const pdf=await pdfjs.getDocument({data:result.bytes.slice(),useSystemFonts:true}).promise;
 let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await (await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')+'\n';
 const target=result.labels.findIndex(l=>l.docId==='tds')+1;assert.ok(text.includes(`page ${target}`),`Reference must resolve page ${target}`);assert.equal(pdf.numPages,result.labels.length);
 fs.mkdirSync('/tmp/rtcc-test',{recursive:true});fs.writeFileSync('/tmp/rtcc-test/result.pdf',result.bytes);
 await assert.rejects(()=>buildSubmittalPdf({...input,sections:[]}),/supporting document/);
});
