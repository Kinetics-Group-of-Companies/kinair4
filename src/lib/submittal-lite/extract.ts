import { openPdfBlob } from "./pdf-range";
import { detectScheduleSeries } from "./schedule-series";
import { supabase } from "@/integrations/backend/client";
// Browser-side text extraction for cover/index uploads.
export type AiReader = (f: { name: string; mediaType: string; base64: string }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

export async function readScannedPage(file: { name: string; mediaType: string; base64: string }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("submittal-assistant", {
    body: { action: "ocr", mediaType: file.mediaType, image: file.base64 },
  });
  if (error) {
    const context = "context" in error ? (error as { context?: Response }).context : undefined;
    const detail = context ? await context.json().catch(() => null) : null;
    return { ok: false, error: detail?.error ?? error.message };
  }
  if (!data?.ok || typeof data.text !== "string") return { ok: false, error: data?.error ?? "Could not read the scanned page." };
  return { ok: true, text: data.text };
}

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function pdfText(file: File, ai: AiReader) {
  const task = await openPdfBlob(file);
  const out: string[] = [];
  try {
    const pdf = await task.promise;
    const scanCandidates: number[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      let line = "";
      let lastY: number | undefined;
      const pageLines: string[] = [];
      for (const it of c.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
        const y = it.transform?.[5];
        if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 3) { pageLines.push(line.trim()); line = ""; }
        line += (it.str ?? "") + " ";
        if (it.hasEOL) { pageLines.push(line.trim()); line = ""; }
        if (y !== undefined) lastY = y;
      }
      if (line.trim()) pageLines.push(line.trim());
      const visibleText = pageLines.filter(Boolean).join("\n");
      if (visibleText.replace(/\s/g, "").length < 30) scanCandidates.push(i);
      else out.push(visibleText);
      page.cleanup();
    }
    // A PDF may have a searchable table while its model code is drawn as an image.
    // Probe a few opening pages for schedule/TDS files before declaring the series unknown.
    const modelDocument = /(?:schedule|data[\s_-]*sheet|datasheet|tds)/i.test(file.name);
    if (modelDocument && !detectScheduleSeries(out.join("\n")).series.length) {
      scanCandidates.push(...Array.from({ length: Math.min(pdf.numPages, 8) }, (_, index) => index + 1));
    }
    if (!scanCandidates.length && pdf.numPages <= 20) return out.join("\n").replace(/ {2,}/g, " ");
    // Render a bounded set of pages, even when the original PDF has hundreds.
    const sampled = pdf.numPages > 20 ? [Math.floor(pdf.numPages / 2), pdf.numPages] : [];
    for (const pageNo of sampled) {
      if (scanCandidates.includes(pageNo)) continue;
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      if (content.items.map((item) => ("str" in item ? String(item.str) : "")).join("").replace(/\s/g, "").length < 30) scanCandidates.push(pageNo);
      page.cleanup();
    }
    const pages = pdf.numPages <= 20
      ? [...new Set([...scanCandidates.slice(0, 4), ...scanCandidates.slice(-4)])].slice(0, 8)
      : [...new Set([...scanCandidates.slice(0, 6), ...sampled.filter((n) => scanCandidates.includes(n))])].slice(0, 8);
    for (const pageNo of pages) {
      const page = await pdf.getPage(pageNo);
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 2100 / Math.max(original.width, original.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Could not render scanned PDF for OCR.");
      try {
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        const image = canvas.toDataURL("image/jpeg", 0.72).split(",")[1]!;
        const result = await ai({ name: file.name + " · page " + pageNo, mediaType: "image/jpeg", base64: image });
        if (!result.ok) {
          if (out.length) continue; // Keep searchable text if supplemental OCR is unavailable.
          throw new Error(result.error);
        }
        if (result.text.trim()) out.push("[OCR page " + pageNo + " of " + pdf.numPages + "]\n" + result.text.trim());
      } finally {
        canvas.width = 0; canvas.height = 0; page.cleanup();
      }
    }
    return out.join("\n").replace(/ {2,}/g, " ");
  } finally { await task.destroy(); }
}

export async function extractText(file: File, ai: AiReader): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".csv") || file.type.startsWith("text/")) return file.text();
  if (name.endsWith(".docx")) {
    throw new Error("Word files are not supported here. Save the document as PDF first.");
  }
  if (name.endsWith(".doc")) throw new Error("Old .doc files can't be read. Save them as PDF first.");
  const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
  if (isPdf) {
    const t = await pdfText(file, ai);
    if (t.replace(/\s/g, "").length > 20) return t;
    throw new Error("Could not read text from the sampled PDF pages. Try a clearer scan or confirm the model code.");
  }
  if (!isPdf && !file.type.startsWith("image/")) throw new Error("Use a searchable PDF or text file.");
  if (file.size > 8_000_000) throw new Error("This image is too large for OCR. Please upload a smaller or clearer image.");
  const r = await ai({ name: file.name, mediaType: isPdf ? "application/pdf" : file.type, base64: toBase64(await file.arrayBuffer()) });
  if (!r.ok) throw new Error(r.error);
  return r.text;
}
