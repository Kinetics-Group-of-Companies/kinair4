const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:99,module:1}}).outputText,f);
const rt=require('../src/lib/submittal-lite/rtcc.ts'),spec=require('../src/lib/submittal-lite/compliance.ts');
test('14 main comments exclude form header and review footer with split number lines',()=>{
 const body='Comments Sheet\nPROJECT\nExample\nDocument No.\nDOC-1\nThe above documents were reviewed and commented as follows:\n'+Array.from({length:14},(_,i)=>`${i+1}.\nOriginal comment ${i+1} with continuation\nline retained.`).join('\n')+'\nReviewed and commented by\nAction Status:\nName\nExample reviewer\nCode B\nSignature';
 const rows=rt.newRtccRows(body);assert.equal(rows.length,14);assert.deepEqual(rows.map(r=>r.sourceNumber),Array.from({length:14},(_,i)=>String(i+1)));assert.ok(rows.every(r=>!/(Signature|Code B|PROJECT|DOC-1)/.test(r.comment)));assert.match(rows[13].comment,/line retained\.$/);
});
test('nested numbered points stay with main comment; numbering gaps are surfaced',()=>{
 assert.equal(rt.newRtccRows('1. Main\n  1. Child\n  2. Child\n2. Main').length,2);
 assert.match(rt.rtccNumberingIssue(rt.newRtccRows('1. First\n3. Third')),/1 to 3/);
});
test('specification headings and page continuations retain hierarchy and wording',()=>{
 const rows=spec.specificationPageRows(['LOGO\nSECTION 233423 - FANS\n1.1\nRELATED DOCUMENTS\nA. Original long requirement\nProject Specifications - Mechanical\n1','LOGO\ncontinued on next page.\nB. Second requirement.\nProject Specifications - Mechanical\n2']);
 assert.equal(rows.length,4);assert.equal(rows[1].kind,'heading');assert.equal(rows[2].clause,'A.');assert.match(rows[2].comment,/continued on next page/);assert.equal(rows[3].sourcePage,2);
});
