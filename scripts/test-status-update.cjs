const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync('src/pages/SubmittalControlPage.tsx','utf8');
const raw=source.slice(source.indexOf('  const setRecordStatus = async'),source.indexOf('\n  const prepareChatRecord'));
function setup(overrides={}){
 const record={id:'r',ref:'MAT-1',rev:0,status:'Draft',updatedAt:'old',history:[],sections:[]};
 const events=[];let saved;
 const env={statusUpdateLock:{current:false},records:[record],rtccReady:()=>true,buildSavedRecordPdf:async()=>{events.push('build');return {bytes:new Uint8Array([1]),labels:[{}]}},uid:()=> 'pdf',File:class{constructor(parts,name,opts){this.name=name;this.type=opts.type;this.size=1}},uploadSubmittalFile:async()=>events.push('upload'),putCloudRecord:async(t,r,expected)=>{assert.equal(expected,'old');events.push('save');saved=r},tenantId:'tenant',setRecords:()=>events.push('ui'),setNotice:()=>{},...overrides};
 const js=ts.transpile(raw,{target:ts.ScriptTarget.ES2022});
 return {run:new Function(...Object.keys(env),js+';return setRecordStatus;')(...Object.values(env)),events,get saved(){return saved},env};
}
test('Submitted builds and uploads fixed PDF before saving status',async()=>{const x=setup();await x.run('r','Submitted','sent');assert.deepEqual(x.events,['build','upload','save','ui']);assert.equal(x.saved.issuedPdf.id,'pdf');assert.equal(x.saved.history[0].note,'sent');});
test('failed PDF preparation rejects without updating status',async()=>{const x=setup({buildSavedRecordPdf:async()=>{throw Error('Missing documents: Specification')}});await assert.rejects(x.run('r','Submitted',''),/Missing documents/);assert.equal(x.saved,undefined);assert.equal(x.env.statusUpdateLock.current,false);});
test('save conflict is returned and UI never reports success',async()=>{const x=setup({putCloudRecord:async()=>{throw Error('Changed in another tab')}});await assert.rejects(x.run('r','Submitted',''),/another tab/);assert.ok(!x.events.includes('ui'));});
test('consultant status reuses issued revision without rebuilding',async()=>{const x=setup();x.env.records[0].issuedPdf={id:'old-pdf'};await x.run('r','Approved','');assert.deepEqual(x.events,['save','ui']);assert.equal(x.saved.issuedPdf.id,'old-pdf');});
