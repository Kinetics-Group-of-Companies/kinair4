const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const root=require('node:path').join(__dirname,'..');

function transpile(path){
 return ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
}
function loadPageFurniture(){
 const exports={};
 vm.runInNewContext(transpile(require('node:path').join(root,'src/lib/submittal-lite/page-furniture.ts')),{exports,require});
 return exports;
}
function loadReplyPoints(){
 const exports={};
 vm.runInNewContext(transpile(require('node:path').join(root,'src/lib/submittal-lite/reply-points.ts')),{exports,require:()=>({})});
 return exports;
}
function loadCompliance(){
 const exports={};
 const pageFurniture=loadPageFurniture(),replyPoints=loadReplyPoints();
 vm.runInNewContext(transpile(require('node:path').join(root,'src/lib/submittal-lite/compliance.ts')),{
  exports,
  require:(id)=>{
   if(id==='./page-furniture')return pageFurniture;
   if(id==='./reply-points')return replyPoints;
   return {};
  },
  crypto:{randomUUID:()=>Math.random().toString(36)}
 });
 return exports;
}

const api=loadCompliance();

const contents=`
E719 Last Mile Center 4 in EZDubai of Dubai South
MEP Specifications - Mechanical
Fans
FANS
CONTENTS
PART 1 GENERAL
1.1 WORK INCLUDED
1.2 DESCRIPTION OF WORK
1.3 QUALITY ASSURANCE
1.4 SUBMITTALS
1.5 MAINTENANCE DATA
1.6 PRODUCT DELIVERY, STORAGE AND HANDLING
PART 2 PRODUCT
2.1 INLINE AXIAL FANS
2.2 MECHANICAL ROOF EXTRACT UNITS
2.3 WALL MOUNTED AXIAL FANS
PART 3 EXECUTION
3.1 INSTALLATION
Page 1 of 9
`;

const page2=`
E719 Last Mile Center 4 in EZDubai of Dubai South
MEP Specifications - Mechanical
Fans
PART 1 GENERAL
1.1 WORK INCLUDED
1.1.1 Compliance with other relative sections, base built specifications.
1.1.2 Conform to General Requirements for MEP Services of section 01 05 00.
1.2 DESCRIPTION OF WORK
1.2.1 Furnish and install fans as required based on approved design and shop drawings.
1.2.2 Types of fans required for project include the following:
        Axial flow fans
        Wall mounted fans
        Smoke extract fans.
Page 2 of 9
`;

const page3=`
E719 Last Mile Center 4 in EZDubai of Dubai South
MEP Specifications - Mechanical
Fans
1.3 QUALITY ASSURANCE
1.3.2 Codes and Standards:
        BS 848 - Fans performance test.
        BS 5000 - Motors performance test.
        ASHRAE Compliance: Test and rate fans in accordance with ASHRAE 51 (AMCA
        210) "Laboratory Methods of Testing Fans for Rating".
1.4 SUBMITTALS
1.4.1 Product Data: Submit manufacturer's technical product data for fans including
        specifications, capacity ratings, fan performance, curves with operating point clearly
        indicated, gauges and finishes of materials, and installation instruction.
Page 3 of 9
`;

const sectionPages=api.specificationSectionPages([contents,page2,page3]);
assert.equal(sectionPages[0],'','CONTENTS/overview page must never become compliance rows');

const rows=api.specificationPageRows([contents,page2,page3]);
assert.ok(rows.some(r=>r.clause==='1.1.1'),'real specification clause must be retained');
assert.ok(!rows.some(r=>r.clause==='1.1'&&/WORK INCLUDED/.test(r.comment)&&r.sourcePage===1),'contents heading must not duplicate real clause');
assert.ok(!rows.some(r=>r.clause==='210)'||r.clause==='210'),'AMCA 210 standard number must not become a clause');

const fanTypes=rows.find(r=>r.clause==='1.2.2');
assert.ok(fanTypes,'1.2.2 must exist');
assert.match(fanTypes.comment,/Types of fans required/);
assert.match(fanTypes.comment,/Axial flow fans/);
assert.match(fanTypes.comment,/Wall mounted fans/);
const fanBody=api.specificationBody(fanTypes);
assert.ok(!/\n(?!\n)/.test(fanBody),'soft OCR line wraps must flow as one natural paragraph');
assert.ok(!/\n\s{2,}/.test(fanBody),'continuation lines must be normalized to the left edge');

const productData=rows.find(r=>r.clause==='1.4.1');
assert.ok(productData,'1.4.1 must exist');
const body=api.specificationBody(productData);
assert.ok(body.startsWith("Product Data:"),'display body must exclude duplicated clause prefix');
assert.ok(body.split('\n').every(line=>line===line.trimStart()),'every exported specification line must begin at the left edge');
assert.ok(!body.includes("including\nspecifications"),'page-width OCR wrapping must not become a hard Excel line break');

console.log('PASS: contents skipped, real clauses retained, OCR indentation removed, standard numbers not misread as clauses');
