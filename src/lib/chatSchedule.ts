import * as XLSX from 'xlsx';

/**
 * Turns an uploaded spreadsheet / CSV schedule into a plain text table the
 * assistant can read. Images and PDFs are sent to the assistant as files
 * instead, so they never come through here.
 */
export async function spreadsheetToText(file: File, maxRows = 200): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const blocks: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, raw: false });
    const lines = rows
      .slice(0, maxRows)
      .map((row) =>
        (row ?? [])
          .map((cell) => (cell == null ? '' : String(cell).trim()))
          .join(' | ')
          .trim(),
      )
      .filter((line) => line.replace(/\|/g, '').trim().length > 0);
    if (!lines.length) continue;
    blocks.push(`Sheet: ${sheetName}\n${lines.join('\n')}`);
  }

  if (!blocks.length) return `Attached spreadsheet "${file.name}" appears to be empty.`;
  return `Schedule from attached spreadsheet "${file.name}":\n\n${blocks.join('\n\n')}`;
}

export function isSpreadsheet(file: File): boolean {
  return /\.(xlsx|xlsm|xls|csv)$/i.test(file.name);
}

export function isReadableAttachment(file: File): boolean {
  return isSpreadsheet(file) || file.type === 'application/pdf' || file.type.startsWith('image/');
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Downscales a photo/screenshot before sending it to the assistant, matching
 * the resolution PDF pages are rendered at (pdfToImages uses scale 2, a few
 * hundred KB to ~1-2 MB). A full-resolution phone screenshot or camera photo
 * sent as-is can be many MB, which times out or drops mid-stream over a
 * mobile connection ("connection was interrupted") instead of ever reaching
 * the model.
 */
export async function imageFileToDataUrl(file: File, maxDim = 2000): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('unreadable image'));
    el.src = dataUrl;
  });
  // Always re-encode as JPEG (even when no resize is needed) so the caller
  // can rely on a consistent output format/mediaType.
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Reads an uploaded PDF schedule in the browser and returns its text.
 * The chat model cannot accept raw PDF bytes, so we extract the text here
 * and (for scanned PDFs with no text layer) fall back to page images.
 */
export async function pdfToText(file: File, maxPages = 15): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as any[];
    // Group text items into visual rows so table columns stay readable.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      const str = String(it.str ?? '').trim();
      if (!str) continue;
      const y = Math.round(it.transform[5] / 4);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: it.transform[4], s: str });
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map((c) => c.s).join(' | '))
      .filter((l) => l.trim().length > 0);
    if (lines.length) pages.push(`Page ${i}\n${lines.join('\n')}`);
  }
  if (!pages.length) return '';
  return `Schedule from attached PDF "${file.name}":\n\n${pages.join('\n\n')}`;
}

/**
 * Strips the "data:<mime>;base64," prefix off a data URL, leaving only the
 * base64 payload. Use this when building a file/image message part for the
 * assistant: the AI SDK's OpenAI-compatible provider re-adds the
 * "data:mime;base64," wrapper itself around whatever string it is given, so
 * passing an already-complete data URL produces a doubly-wrapped, invalid
 * URL that the model can never decode as an image.
 */
export function toBase64Payload(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** Renders the first pages of a PDF as PNG data URLs (for scanned schedules). */
export async function pdfToImages(file: File, maxPages = 4): Promise<string[]> {
  const pdfjs: any = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: string[] = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(canvas.toDataURL('image/png'));
  }
  return out;
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
