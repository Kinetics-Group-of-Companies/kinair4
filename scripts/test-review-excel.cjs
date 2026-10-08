const ts=require('typescript');
const fs=require('fs'),assert=require('node:assert/strict');
const p='src/lib/submittal-lite/review-excel.ts';
const source=fs.readFileSync(p,'utf8');const moduleResult={exports:{}};
const compliance={exports:{}};
new Function('exports','require',ts.transpileModule(fs.readFileSync('src/lib/submittal-lite/compliance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(compliance.exports,require);
new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(moduleResult.exports,name=>name==='./compliance'?compliance.exports:require(name));
const {complianceExportTables,rtccExportTables,downloadReviewExcel}=moduleResult.exports;
const fields=[{label:'Project Name',value:'Warehouse in Al Quoz'},{label:'Client',value:'M/S XYZ PROPERTIES L.L.C.'},{label:'Empty',value:''}];
const sections=[{id:'s',title:'TECHNICAL DATA SHEET',docs:[{id:'d',name:'KVF-100P.pdf'}]}];
const row={id:'1',comment:'=Keep original text\n230/1/50',reply:'Engineer edited reply',responsibility:'Supplier',reviewed:false,evidence:[{docId:'d',quote:'230 V'}],comparison:{requirement:'GI',offered:'GI powder coating',justification:'Source evidence'}};
const c=complianceExportTables({title:'Compliance',sourceChecked:true,rows:[{...row,clause:'1.2',sourcePage:3,included:true},{...row,id:'2',clause:'1.3',sourcePage:4,included:false,exclusion:'Outside scope'}]},fields,sections);
assert.equal(c.length,3);assert.equal(c[0].rows.at(-1)[0],'1.2');assert.equal(c[0].rows.at(-1)[1],row.comment);assert.equal(c[0].rows.at(-1)[2],row.reply);assert.match(c[1].rows.at(-1)[6],/TECHNICAL DATA SHEET \/ KVF-100P.pdf/);assert.equal(c[2].rows[1][3],'Outside scope');assert.equal(c[0].rows[c[0].header].length,c[0].widths.length);
assert.equal(compliance.exports.complianceProposedTitle({proposedTitle:'Proposed KINAIR KVF-P'},fields),'Proposed KINAIR KVF-P');
assert.ok(compliance.exports.complianceReady({sourceChecked:true,rows:[{...row,included:true,reviewed:true},{...row,included:true,kind:'heading',reply:'',reviewed:false}]}));
assert.ok(!compliance.exports.complianceReady({sourceChecked:true,rows:[{...row,included:true,kind:'heading',reply:'',reviewed:false}]}));
const rounds=[{number:1,date:'2026-09-20',rows:[row]},{number:3,date:'2026-09-30',rows:Array.from({length:15},(_,i)=>({...row,id:''+i,comment:'Comment '+i}))}];
const r=rtccExportTables(rounds,fields,sections);assert.equal(r[0].name,'RTCC 03');assert.equal(r[2].name,'RTCC 01');assert.equal(rounds[0].number,1);assert.equal(r[0].rows.at(-1)[0],15);assert.equal(r[0].rows.at(-1)[1],'Comment 14');assert.equal(r[2].rows.at(-1)[2],row.reply);assert.equal(r[2].rows[r[2].header].length,r[2].widths.length);
assert.match(rtccExportTables([{number:1,date:'',rows:[{...row,evidence:[{docId:'gone',quote:'quote'}]}]}],fields,sections)[1].rows.at(-1)[5],/Missing supporting document/);
Promise.all([assert.rejects(downloadReviewExcel([], 'empty.xlsx')),assert.rejects(downloadReviewExcel([{name:'Long',rows:[['x'.repeat(32768)]],header:0,widths:[1]}],'long.xlsx'))]).then(()=>console.log('PASS: full row preservation, latest RTCC first, edited replies, project details, evidence names, exclusion audit, missing evidence, cell-length guard'));
for(const file of ['ComplianceEditor.tsx','RtccEditor.tsx']){const out=ts.transpileModule(fs.readFileSync('src/components/submittal-lite/'+file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});assert.equal((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);}


