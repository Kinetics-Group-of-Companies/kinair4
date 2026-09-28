const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const path=require('node:path');
function load(name){const exports={};const source=fs.readFileSync(path.join(__dirname,'../src/lib/submittal-lite',name+'.ts'),'utf8');new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>n==='./cover-fields'?load('cover-fields'):require(n));return exports;}
test('long project details and supplier rows fit one generated cover',async()=>{
const fields=[{label:'Project Name',value:'Warehouse in Al Quoz'},...Array.from({length:12},(_,i)=>({label:'Project detail '+i,value:'M/S XYZ DEVELOPMENT AND CONSTRUCTION L.L.C.'})),{label:'Supplier Name',value:'Kinetics Middle East LLC'},{label:'Brand Name',value:'KINAIR'},{label:'Product',value:'Fan'}];
const result=await load('pdf-build').buildSubmittalPdf({kindLabel:'MATERIAL SUBMITTAL FOR FANS',title:'Warehouse in Al Quoz',fields,sections:[],templates:{},stampEveryPage:false});
assert.equal(result.labels.filter(x=>x.kind==='cover').length,1);fs.writeFileSync(path.join(__dirname,'../cover-fit-test.pdf'),result.bytes);
});

test('certificate stamp and page number occupy a new band outside source content',async()=>{
 const {PDFDocument,rgb,degrees}=require('pdf-lib');
 const source=await PDFDocument.create();const page=source.addPage([595,842]);page.drawRectangle({x:0,y:0,width:595,height:842,color:rgb(0.8,0.8,0.8)});page.setRotation(degrees(90));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
 const result=await load('pdf-build').buildSubmittalPdf({kindLabel:'Material',title:'Test',fields:[],templates:{},stampEveryPage:true,stamp:{bytes:png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength),type:'image/png',name:'stamp.png'},sections:[{title:'Certificates',stamp:'all',files:[{bytes:(await source.save()).buffer,type:'application/pdf',name:'certificate.pdf'}]}]});
 const output=await PDFDocument.load(result.bytes);const cert=output.getPage(output.getPageCount()-1);
 assert.equal(cert.getCropBox().y,-90);assert.equal(cert.getCropBox().height,932);assert.equal(cert.getRotation().angle,90);
});
