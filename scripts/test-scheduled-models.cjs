const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/lib/chatSelectionSchedule.ts'), 'utf8');
let chosenUnits, optimized = 0;
const ctx = { AIRFLOW_UNITS: { CFM: 1 }, PRESSURE_UNITS: { Pa: 1 }, calculateAirDensity: () => 1.2,
  findOptimalSelections: db => db.fans.map(f => ({ nomenclature: f.code })),
  selectAirCurtains: () => { optimized++; return [{ arrangement: 'WRONG SUBSTITUTE' }]; },
  rebuildAirCurtainSelection: units => { chosenUnits = units; return { arrangement: units.map(u => `${u.qty} x ${u.model.model}`).join(' + ') }; },
};
vm.createContext(ctx);
vm.runInContext(ts.transpileModule(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nglobalThis.ac = selectScheduleAirCurtain; globalThis.fan = selectScheduleFan;', ctx);
const models = ['FM-4518-L(/Y)', 'FM-3518-L(/Y)', 'FM-1215N-2(Y)', 'FM-1220N-2(Y)'].map(model => ({ model }));
test('supplied FM-45 remains FM-45 instead of optimizing to FM-35', () => {
  const result = ctx.ac({ existing_selection: models[0].model, door_width: 1700, door_height: 2.235 }, models, [], [], 'balanced', undefined, true);
  assert.equal(result.selection.arrangement, '1 x FM-4518-L(/Y)'); assert.equal(optimized, 0);
});
test('two scheduled sliding-door units remain two of the same model', () => {
  ctx.ac({ existing_selection: '2 x FM-1215N-2(Y)', door_width: 2864, door_height: 2.862 }, models, [], [], 'balanced', undefined, true);
  assert.equal(chosenUnits.length, 1); assert.equal(chosenUnits[0].qty, 2); assert.equal(chosenUnits[0].model.model, models[2].model);
});
test('unknown or ambiguous scheduled models fail closed without alternatives', () => {
  assert.equal(ctx.ac({ existing_selection: 'FM-9999' }, models, [], [], 'balanced', undefined, true), null);
  assert.equal(ctx.ac({ existing_selection: models[0].model }, [models[0], models[0]], [], [], 'balanced', undefined, true), null);
  assert.equal(optimized, 0);
});
test('mixed arrangements retain individual models and counts', () => {
  ctx.ac({ existing_selection: '2 x FM-1215N-2(Y) + 1 x FM-1220N-2(Y)' }, models, [], [], 'balanced', undefined, true);
  assert.deepEqual(Array.from(chosenUnits, u => u.qty), [2, 1]);
});
test('fan is constrained to its printed family and size despite conflicting remarks', () => {
  const db = { series: [{ id: 'p', name: 'KVF-P' }], fans: [{ diameter: 200, series: 'KVF-P', code: 'KVF-200P' }, { diameter: 250, series: 'KVF-P', code: 'KVF-250P' }] };
  assert.equal(ctx.fan({ airflow: 100, static_pressure: 50, existing_selection: 'KVF-200P', remarks: 'wall mounted' }, db, undefined, 'balanced', undefined, true).nomenclature, 'KVF-200P');
  assert.equal(ctx.fan({ airflow: 100, static_pressure: 50, existing_selection: 'KVF-300P' }, db, undefined, 'balanced', undefined, true), null);
});

test('OCR repair supports confusable fan characters without changing valid codes',()=>{
 const db={series:[{id:'p',name:'KVF-P'}],fans:[{diameter:100,series:'KVF-P',code:'KVF-100P'}]};
 assert.equal(ctx.fan({airflow:100,static_pressure:50,existing_selection:'KVF-lOOP'},db,undefined,'balanced',undefined,true).nomenclature,'KVF-100P');
});
test('air curtain OCR repair preserves unit counts and suffixes',()=>{
 const result=ctx.ac({existing_selection:'2 x FM-45I8-L(/Y)'},models,[],[],'balanced',undefined,true);
 assert.equal(result.selection.arrangement,'2 x FM-4518-L(/Y)');
 assert.equal(ctx.ac({existing_selection:'FM-45I8-XD'},models,[],[],'balanced',undefined,true),null);
});
test('ambiguous OCR codes require review while exact codes still win',()=>{
 vm.runInContext('globalThis.resolve=resolveOcrModel;',ctx);
 assert.equal(ctx.resolve('AB-IOS',['AB-105','AB-1O5']),null);
 assert.equal(ctx.resolve('AB-105',['AB-105','AB-1O5']),'AB-105');
});
