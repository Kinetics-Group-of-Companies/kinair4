// Run with: node --test scripts/test-submittal-reader.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const reader = fs.readFileSync(path.join(root, 'src/lib/submittal-lite/extract.ts'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'src/components/submittal-lite/SubmittalChat.tsx'), 'utf8');
const schedule = 'ANNEXURE - AIR CURTAINS SCHEDULE\nDoor-01 | 1700 mm | 2235 mm | FM-4518-L(/Y) | 1482 cfm\nDoor-05 | 1940 mm | 2800 mm | FM-4520XD(B)-L/(Y)';
const file = { name: 'ACU Schedule.pdf', type: 'application/pdf', size: 821745, arrayBuffer: async () => new ArrayBuffer(12) };
const never = () => new Promise(() => {});
function compile(source) {
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
  assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  return result.outputText;
}
function readWith({ direct, local }) {
  const context = { btoa, Uint8Array, supabase: { functions: { invoke: direct } }, openPdfBlob: local, detectScheduleSeries: () => ({ series: ['N-Centrifugal Flow'] }) };
  vm.createContext(context);
  vm.runInContext(compile(reader.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')) + '\nglobalThis.run = extractTextAdvanced;', context);
  return context.run(file, async () => ({ ok: false, error: 'OCR unavailable' }), { firstReadable: true, directAi: true, mobileFast: true });
}
test('successful server text is returned while mobile PDF reader stalls', { timeout: 1000 }, async () => {
  const result = await readWith({ direct: async () => ({ data: { ok: true, text: schedule, provider: 'openai' } }), local: never });
  assert.equal(result.text, schedule); assert.equal(result.directProvider, 'openai');
});
test('successful PDF text is returned while server reader stalls', { timeout: 1000 }, async () => {
  let destroyed = false;
  const result = await readWith({ direct: never, local: async () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: schedule, transform: [1,0,0,1,0,0] }] }), cleanup() {} }) }), destroy: async () => { destroyed = true; } }) });
  assert.ok(result.text.includes('FM-4518-L(/Y)')); assert.equal(destroyed, true);
});
test('both reader failures retain the concrete cause', async () => {
  await assert.rejects(readWith({ direct: async () => ({ error: { message: 'Server offline' } }), local: async () => { throw new Error('PDF worker failed'); } }), /Server offline|PDF worker failed/);
});
test('a previously failed upload is retried and its error is cleared', async () => {
  const source = ts.createSourceFile('chat.tsx', chat, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'prepareUploadsForSend') declaration = node; ts.forEachChild(node, visit); }
  visit(source); assert.ok(declaration);
  let reads = 0, state;
  const context = {
    uploads: [{ file, kind: 'support', sectionTitle: 'Material schedule', sourceRole: 'schedule', scheduleError: 'Document reading timed out.' }],
    setReadingUploads() {}, modelCatalog: [{}], tenantId: 'test', mobileMode: true,
    window: { matchMedia: () => ({ matches: true }), setTimeout: () => 1 }, navigator: { userAgent: 'iPhone' },
    isSpreadsheet: () => false, pdfToText: async () => { reads++; return schedule; },
    extractTextAdvanced: async () => ({ text: schedule, methods: ["server"], warnings: [] }), readScannedPage() {},
    normalizeOcrModelCodes: text => text, isQuotationText: () => false,
    classifyUpload: () => ({ kind: 'support', sectionTitle: 'Material schedule', isSchedule: true }),
    setUploads: value => { state = value; },
  };
  vm.createContext(context); vm.runInContext(compile(`const ${declaration.getText(source)};\nglobalThis.run = prepareUploadsForSend;`), context);
  const result = await context.run();
  assert.equal(reads, 1); assert.equal(result[0].scheduleError, undefined); assert.equal(state[0].scheduleText, schedule);
  assert.equal(result[0].excludeFromPdf, false);
});
