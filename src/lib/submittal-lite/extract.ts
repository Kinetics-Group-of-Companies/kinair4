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

type ServerRead = { text: string; provider?: string };

async function readDocumentServer(file: File): Promise<ServerRead> {
  if (file.size > 11_500_000) throw new Error("File is too large for direct AI reading.");
  const base64 = toBase64(await file.arrayBuffer());
  const { data, error } = await supabase.functions.invoke("submittal-assistant", {
    body: {
      action: "read_document",
      fileName: file.name,
      mediaType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      fileData: base64,
    },
  });
  if (error) {
    const context = "context" in error ? (error as { context?: Response }).context : undefined;
    const detail = context ? await context.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  if (!data?.ok || typeof data.text !== "string" || !data.text.trim()) throw new Error(data?.error ?? "Could not read document.");
  return { text: data.text, provider: typeof data.provider === "string" ? data.provider : undefined };
}

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function pdfText(file: File, ai: AiReader, options?: { mobileFast?: boolean }) {
  const task = await openPdfBlob(file);
  const out: string[] = [];
  try {
    const pdf = await task.promise;
    const scanCandidates: number[] = [];
    const textPageLimit = options?.mobileFast ? 12 : 40;
    for (let i = 1; i <= Math.min(pdf.numPages, textPageLimit); i++) {
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
    // A PDF may have searchable text while the important model code/table is drawn
    // as an image. Filename is never evidence: if no verified selector series is visible
    // in the text layer, OCR a bounded set of opening pages regardless of filename.
    if (!detectScheduleSeries(out.join("\n")).series.length) {
      scanCandidates.push(...Array.from({ length: Math.min(pdf.numPages, 8) }, (_, index) => index + 1));
    }
    if (!scanCandidates.length && pdf.numPages <= textPageLimit) return out.join("\n").replace(/ {2,}/g, " ");
    // Render a bounded set of pages, even when the original PDF has hundreds.
    const sampled = pdf.numPages > textPageLimit ? (options?.mobileFast ? [pdf.numPages] : [Math.floor(pdf.numPages / 2), pdf.numPages]) : [];
    for (const pageNo of sampled) {
      if (scanCandidates.includes(pageNo)) continue;
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      if (content.items.map((item) => ("str" in item ? String(item.str) : "")).join("").replace(/\s/g, "").length < 30) scanCandidates.push(pageNo);
      page.cleanup();
    }
    const ocrLimit = options?.mobileFast ? 5 : 12;
    const pages = pdf.numPages <= textPageLimit
      ? [...new Set(options?.mobileFast ? scanCandidates.slice(0, ocrLimit) : [...scanCandidates.slice(0, 4), ...scanCandidates.slice(-4)])].slice(0, ocrLimit)
      : [...new Set(options?.mobileFast ? [...scanCandidates.slice(0, 2), ...sampled] : [...scanCandidates.slice(0, 6), ...sampled.filter((n) => scanCandidates.includes(n))])].slice(0, ocrLimit);
    for (const pageNo of pages) {
      const page = await pdf.getPage(pageNo);
      const original = page.getViewport({ scale: 1 });
      const scaleCap = options?.mobileFast ? 1.75 : 3;
      const pixelCap = options?.mobileFast ? 1600 : 2600;
      const scale = Math.min(scaleCap, pixelCap / Math.max(original.width, original.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Could not render scanned PDF for OCR.");
      try {
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        const image = canvas.toDataURL("image/jpeg", options?.mobileFast ? 0.8 : 0.9).split(",")[1]!;
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

export type AdvancedReadResult = {
  text: string;
  methods: string[];
  warnings: string[];
  directProvider?: string;
};

/**
 * High-accuracy attachment reader.
 * - PDF: searchable text + sampled high-resolution vision/OCR + direct whole-file AI read when size allows.
 * - Image: direct vision read plus OCR fallback.
 * - Text/CSV: exact source text.
 * The merged output intentionally keeps independent readings labelled so the downstream AI can reconcile them.
 */
export async function extractTextAdvanced(
  file: File,
  ai: AiReader,
  options?: { mobileFast?: boolean; directAi?: boolean; firstReadable?: boolean },
): Promise<AdvancedReadResult> {
  const name = file.name.toLowerCase();
  const methods: string[] = [];
  const warnings: string[] = [];

  if (name.endsWith(".txt") || name.endsWith(".csv") || file.type.startsWith("text/")) {
    return { text: await file.text(), methods: ["source text"], warnings };
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    throw new Error("Word files should be saved as PDF so the advanced reader can preserve layout, tables and scanned pages.");
  }

  const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(name);
  if (!isPdf && !isImage) throw new Error("Use PDF, image, spreadsheet, CSV or text files.");

  let direct: ServerRead | null = null;
  let local = "";

  // Whole-file AI vision/document reading is independent from browser extraction.
  // Running both gives us two readings to cross-check instead of trusting one OCR pass.
  const directPromise = options?.directAi !== false && file.size <= 11_500_000 && (isPdf || ["image/jpeg", "image/png"].includes(file.type))
    ? readDocumentServer(file).catch((error) => {
        warnings.push(error instanceof Error ? error.message : "Direct AI document read failed.");
        return null;
      })
    : Promise.resolve(null);

  const localPromise = (async () => {
    if (isPdf) return pdfText(file, ai, options);
    if (file.size > 12_000_000) throw new Error("This image is too large. Please upload a smaller copy or PDF.");
    // For normal JPEG/PNG, run the dedicated OCR/vision ladder.
    if (["image/jpeg", "image/png"].includes(file.type)) {
      const r = await ai({ name: file.name, mediaType: file.type, base64: toBase64(await file.arrayBuffer()) });
      if (!r.ok) throw new Error(r.error);
      return r.text;
    }
    // Browser-decodable formats such as WebP are normalized to JPEG first.
    const src = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = src;
      await image.decode();
      const max = options?.mobileFast ? 1800 : 2800;
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Could not prepare image for OCR.");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1]!;
      canvas.width = 0; canvas.height = 0;
      const r = await ai({ name: file.name, mediaType: "image/jpeg", base64 });
      if (!r.ok) throw new Error(r.error);
      return r.text;
    } finally {
      URL.revokeObjectURL(src);
    }
  })().catch((error) => {
    warnings.push(error instanceof Error ? error.message : "Local/OCR reading failed.");
    return "";
  });

  // Interactive chat must not discard a successful server reading merely
  // because PDF.js or supplemental OCR is still running on a mobile device.
  if (options?.firstReadable) {
    try {
      const result = await Promise.any([
        directPromise.then((value): AdvancedReadResult => {
          if (!value?.text.trim()) throw new Error("No direct document text.");
          return { text: value.text.slice(0, 40000), methods: ["direct AI document vision"], warnings: [...warnings], directProvider: value.provider };
        }),
        localPromise.then((value): AdvancedReadResult => {
          if (!value.trim()) throw new Error("No local document text.");
          return { text: value.slice(0, 40000), methods: [isPdf ? "PDF text + page OCR" : "image OCR"], warnings: [...warnings] };
        }),
      ]);
      return result;
    } catch {
      throw new Error(warnings.join("; ") || "No readable text found.");
    }
  }

  [direct, local] = await Promise.all([directPromise, localPromise]);
  const blocks: string[] = [];
  if (direct?.text.trim()) {
    methods.push("direct AI document vision");
    blocks.push("[AI FULL-DOCUMENT READ]\n" + direct.text.trim());
  }
  if (local.trim()) {
    methods.push(isPdf ? "PDF text + page OCR" : "image OCR");
    const normalizedDirect = direct?.text.replace(/\s+/g, " ").trim();
    const normalizedLocal = local.replace(/\s+/g, " ").trim();
    if (!normalizedDirect || normalizedLocal !== normalizedDirect) blocks.push("[TEXT/OCR CROSS-CHECK]\n" + local.trim());
  }
  const text = blocks.join("\n\n").trim();
  if (!text) throw new Error(warnings[0] || "No readable text found.");
  return { text: text.slice(0, 40000), methods, warnings, directProvider: direct?.provider };
}

export async function extractText(file: File, ai: AiReader, options?: { mobileFast?: boolean }): Promise<string> {
  const result = await extractTextAdvanced(file, ai, { ...options, directAi: true });
  return result.text;
}
