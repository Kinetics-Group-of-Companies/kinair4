const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
const base=path.join(__dirname,'../supabase/functions');
const source=fs.readFileSync(path.join(base,'submittal-assistant/model-routing.ts'),'utf8');
const context={exports:{},Date,AbortSignal,console};vm.createContext(context);
vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}}).outputText,context);
const {eligibleModels,failureKind}=context.exports;
const model=(id,more={})=>({provider:'openai',model_id:id,tier:'cheap',cost_rank:10,enabled:true,...more});
test('future versions use configured cost, not the latest name',()=>{
 const rows=[model('gpt-10-luna'),model('gpt-9-luna'),model('gpt-8-luna')];
 const rates=[{provider:'openai',model:'gpt-10-luna',input_usd:1,output_usd:4},{provider:'openai',model:'gpt-9-luna',input_usd:.1,output_usd:.5}];
 assert.deepEqual(Array.from(eligibleModels(rows,rates),m=>m.model_id),['gpt-9-luna','gpt-10-luna','gpt-8-luna']);
});
test('unknown price, disabled, preview and cooling-down models are excluded',()=>{
 const rows=[model('gpt-10-luna',{metadata:{pricing_status:'unverified'}}),model('gpt-9-luna',{enabled:false}),model('gpt-8-preview'),model('gpt-7-luna',{metadata:{unavailable_until:2000}}),model('gpt-6-luna')];
 assert.deepEqual(Array.from(eligibleModels(rows,[],1000),m=>m.model_id),['gpt-6-luna']);
});
test('known price does not reactivate an admin disabled model',()=>{
 assert.equal(eligibleModels([model('future',{enabled:false,metadata:{auto_discovered:true,pricing_status:'unverified'}})],[{provider:'openai',model:'future',input_usd:0,output_usd:0}]).length,0);
});
test('model retirement differs from quota and ordinary content errors',()=>{
 assert.equal(failureKind({statusCode:404}),'unavailable');assert.equal(failureKind({status:410}),'unavailable');
 assert.equal(failureKind({statusCode:429}),'quota');assert.equal(failureKind(new Error('schema invalid')),'other');
});
test('cooldown expires and equal-price versions sort numerically',()=>{
 const rows=[model('gpt-9-luna'),model('gpt-10-luna',{metadata:{unavailable_until:1000}})];
 assert.equal(eligibleModels(rows,[],2000)[0].model_id,'gpt-10-luna');
});
test('all modified edge sources parse',()=>{
 for(const file of ['ai-model-registry/index.ts','submittal-assistant/index.ts','submittal-assistant/model-routing.ts']){
 const output=ts.transpileModule(fs.readFileSync(path.join(base,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:99,module:99}});
 assert.deepEqual(output.diagnostics.filter(d=>d.category===1),[]);
 }
});
