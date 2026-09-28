const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/submittal-lite/cover-fields.ts'), 'utf8');
const context = { exports: {} }; vm.createContext(context);
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { normalizeCoverFields } = context.exports;
test('client aliases collapse and a real name replaces placeholders', () => {
  const rows = normalizeCoverFields([{label:'Client Name',value:'(not provided)'},{label:'Client',value:'XYZ Properties'},{label:'Client Name',value:'(not provided)'}]);
  assert.equal(rows.length,1); assert.equal(rows[0].value,'XYZ Properties'); assert.equal(rows[0].label,'Client');
});
test('project and consultant aliases are deduplicated without changing customer wording', () => {
  const rows = normalizeCoverFields([{label:'Project',value:'Warehouse'},{label:'Project Name',value:'Warehouse'},{label:'Consultant',value:'XYZ'},{label:'MEP Consultant',value:'XYZ'}]);
  assert.equal(rows.length,2); assert.equal(rows[0].label,'Project'); assert.equal(rows[1].label,'Consultant');
});
test('empty/placeholder fields disappear from output and custom fields retain order', () => {
  const rows = normalizeCoverFields([{label:'Client',value:'not provided'},{label:'Plot No./Loc',value:'Al Quoz'},{label:'Tender Reference',value:'T-123'}]);
  assert.deepEqual(Array.from(rows, x=>x.label),['Plot No./Loc','Tender Reference']);
});
