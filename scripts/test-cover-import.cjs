const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');const ctx={exports:{}};vm.createContext(ctx);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:99,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInContext(compile(fs.readFileSync(path.join(root,'src/lib/submittal-lite/cover-fields.ts'),'utf8')),ctx);
const {replaceImportedCoverFields}=ctx.exports;
test('replacement cover removes stale project values and unused default rows',()=>{
 const previous=[{label:'Project Name',value:'Old project'},{label:'Location',value:'Roof'},{label:'Main Contractor',value:''},{label:'MEP Contractor',value:''},{label:'Unwanted OCR heading',value:'Old text'},{label:'Supplier Name',value:'Kinetics Middle East LLC'}];
 const imported=[{label:'PROJECT NAME',value:'WESTIN BY MARRIOT-ADDIS ABABA, ETHIOPIA'},{label:'CLIENT',value:'M/s. MIDROC INVESTMENT GROUP, ETHIOPIA'},{label:'CONSULTANT',value:'M/s. SEED ENGINEERING CONSULTANTS, UAE'},{label:'CONTRACTOR',value:'M/s. SHAFA AL NAHDAH BUILDING CONTRACTING LLC, UAE'}];
 const actual=replaceImportedCoverFields(previous,imported);
 assert.equal(actual.length,5);assert.equal(actual[0].value,imported[0].value);assert.equal(actual[3].label,'CONTRACTOR');assert.equal(actual[4].label,'Supplier Name');
 assert.ok(!actual.some(f=>/Location|MEP Contractor|Unwanted/.test(f.label)));
});
test('Build does not reimport a field the user removed after upload',async()=>{
 const source=fs.readFileSync(path.join(root,'src/pages/SubmittalControlPage.tsx'),'utf8');const ast=ts.createSourceFile('page.tsx',source,99,true,ts.ScriptKind.TSX);let fn;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='read')fn=n;ts.forEachChild(n,visit);}visit(ast);assert.ok(fn);
 const original='PROJECT NAME: Original\nCLIENT: Removed';let changed=false;
 const c={coverText:original,indexMode:'general',indexText:'',appliedCoverText:{current:original},setNotice(){},setReading(){},localParse:()=>({fields:[{label:'CLIENT',value:'Removed'}],sections:[],title:null,brand:null,product:null}),setFields(){changed=true},replaceImportedCoverFields,brand:null,seriesIds:[],company:null,docsForSelection:()=>[],setSections(){},sections:[]};
 vm.createContext(c);vm.runInContext(compile('const '+fn.getText(ast)+';globalThis.run=read;'),c);await c.run();assert.equal(changed,false);
});
