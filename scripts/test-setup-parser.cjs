const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const ctx={exports:{}};vm.createContext(ctx);vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/submittal-lite/setup-parser.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}}).outputText,ctx);
const {parseIndexHeadings,parseCoverDetails,setupPdfLines}=ctx.exports;
test('checklist metadata and skipped serial are not dividers; wrapped heading stays whole',()=>{
 const input=`Technical submission checklist
Project Name
Sr. No\tItem\tYes No N/A\tComments
01\tSchedule of Material
Yes
02\tSpecification
No
03\tCompliance Statement\tNo
04\tTechnical Data Sheets
Yes
05\tMaterial Safety Data Sheets
Yes
3rd Party Test Reports
06\tYes
07\tCertificates\tYes
08\tValid Trade License
Yes
09\tDraft Warranty Certificate
Yes
11\tCompany Profile
Yes
12\tProjects previous approvals
Yes
13\tOrigin Certificate\tYes
14\tAuthorization certificate
Yes
15\tEmergency Contact Details (Supplier &\tYes
Manufacturer)`;
 const headings=parseIndexHeadings(input);
 assert.equal(headings.length,14);assert.equal(headings[5],'3rd Party Test Reports');assert.equal(headings[13],'Emergency Contact Details (Supplier & Manufacturer)');
 assert.ok(headings.includes('Specification'));assert.ok(headings.includes('Compliance Statement'));
 assert.equal(parseIndexHeadings(input+'\n'+input).length,14);
});
test('project details heading is excluded and field text is preserved exactly',()=>{
 const fields=parseCoverDetails('Project Details:\nPROJECT NAME : WESTIN BY MARRIOT-ADDIS ABABA, ETHIOPIA\nCLIENT : M/s. MIDROC INVESTMENT GROUP, ETHIOPIA\nCONSULTANT : M/s. SEED ENGINEERING CONSULTANTS, UAE\nCONTRACTOR : M/s. SHAFA AL NAHDAH BUILDING CONTRACTING LLC, UAE');
 assert.equal(fields.length,4);assert.equal(fields[0].value,'WESTIN BY MARRIOT-ADDIS ABABA, ETHIOPIA');assert.equal(fields[3].label,'CONTRACTOR');
});
test('PDF superscript and split field tokens retain their visual reading order',()=>{
 const item=(str,x,y,width)=>({str,transform:[14,0,0,14,x,y],width});
 assert.equal(setupPdfLines([item('Party Test Reports',100.1,460.63,100),item('rd',88.944,465.67,8.073),item('3',82,460.63,7)]),'3rd Party Test Reports');
 assert.equal(setupPdfLines([item('Test Project',150,400,60),item('PROJECT NAME :',20,400,125)]),'PROJECT NAME : Test Project');
});
