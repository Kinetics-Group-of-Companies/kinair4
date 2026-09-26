import type { PDFDocument as PDFDoc, PDFFont, PDFImage, PDFPage } from "pdf-lib";

export type FileData = { bytes: ArrayBuffer; type: string; name: string };
export type BuildInput = {
  kindLabel: string;
  coverLabel?: string | undefined;
  title: string;
  companyName?: string | undefined;
  brandName?: string | undefined;
  productName?: string | undefined;
  fields: { label: string; value: string }[];
  sections: { title: string; files: FileData[]; stamp?: "all" | "divider" | "none" | undefined }[];
  stampCover?: boolean;
  stampIndex?: boolean;
  templates: { cover?: FileData | undefined; index?: FileData | undefined; divider?: FileData | undefined };
  sourceCover?: FileData | undefined;
  sourceIndex?: FileData | undefined;
  useDefaultCover?: boolean | undefined;
  useDefaultIndex?: boolean | undefined;
  companyLogo?: FileData | undefined;
  brandLogo?: FileData | undefined;
  stamp?: FileData | undefined;
  stampEveryPage: boolean;
};
export type PageLabel = { label: string; kind: "cover" | "index" | "divider" | "doc" };

const DEFAULT_W = 595.28;
const DEFAULT_H = 841.89;

const clean = (s: string) =>
  s
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");

function wrap(text: string, font: PDFFont, size: number, max: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > max && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export const isPdf = (f: FileData) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
export const isImg = (f: FileData) => /image\/(png|jpe?g)/.test(f.type) || /\.(png|jpe?g)$/i.test(f.name);

export async function buildSubmittalPdf(input: BuildInput): Promise<{ bytes: Uint8Array; labels: PageLabel[]; skipped: string[] }> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const doc: PDFDoc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.42, 0.42, 0.46);
  const line = rgb(0.8, 0.8, 0.82);
  const blue = rgb(0.04, 0.25, 0.49);
  const skyBlue = rgb(0.28, 0.68, 0.9);
  const paleBlue = rgb(0.9, 0.97, 1);
  const softBlue = rgb(0.97, 0.99, 1);
  const labels: PageLabel[] = [];
  const skipped: string[] = [];

  const embedImg = async (f?: FileData): Promise<PDFImage | undefined> => {
    if (!f) return;
    try { return /png/i.test(f.type) || /\.png$/i.test(f.name) ? await doc.embedPng(f.bytes.slice(0)) : await doc.embedJpg(f.bytes.slice(0)); } catch { skipped.push(f.name); return; }
  };
  type Bg = { img: PDFImage } | { pdf: PDFDoc };
  const embedBg = async (f?: FileData): Promise<Bg | undefined> => {
    if (!f) return;
    if (isPdf(f)) {
      try {
        const pdf = await PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
        if (!pdf.getPageCount()) return;
        try { pdf.getForm().flatten(); } catch { /* keep non-form template artwork intact */ }
        return { pdf };
      } catch { skipped.push(f.name); return; }
    }
    const img = await embedImg(f);
    return img ? { img } : undefined;
  };

  const coverBg = await embedBg(input.templates.cover);
  const indexBg = await embedBg(input.templates.index);
  const sourceCover = await embedBg(input.sourceCover);
  const sourceIndex = await embedBg(input.sourceIndex);
  const dividerBg = await embedBg(input.templates.divider);
  const stamp = await embedImg(input.stamp);
  const companyLogo = await embedImg(input.companyLogo);
  const brandLogo = await embedImg(input.brandLogo);

  const sizeOf = (bg?: Bg): [number, number] => {
    if (!bg) return [DEFAULT_W, DEFAULT_H];
    if ("pdf" in bg) { const { width, height } = bg.pdf.getPage(0).getSize(); return [width, height]; }
    const ratio = bg.img.height / bg.img.width;
    return [DEFAULT_W, DEFAULT_W * ratio];
  };
  const newPage = async (bg?: Bg) => {
    const [width, height] = sizeOf(bg);
    if (bg && "pdf" in bg) {
      const [copied] = await doc.copyPages(bg.pdf, [0]);
      if (copied) { doc.addPage(copied); return copied; }
    }
    const page = doc.addPage([width, height]);
    if (bg && "img" in bg) page.drawImage(bg.img, { x: 0, y: 0, width, height });
    return page;
  };

  // Company logo top-left, brand logo top-right — on cover, index and divider pages.
  function drawLogos(page: PDFPage) {
    const { width, height } = page.getSize();
    const x = width * 0.08, boxW = 170, boxH = 64, y = height - height * 0.13;
    if (companyLogo) drawLogo(page, companyLogo, x, y, boxW, boxH);
    else if (input.companyName) { const t = clean(input.companyName.toUpperCase()); page.drawText(t, { x, y: y + 18, size: 13, font: bold, color: ink }); }
    if (brandLogo) drawLogo(page, brandLogo, width - x - boxW, y, boxW, boxH);
    else if (input.brandName) { const t = clean(input.brandName.toUpperCase()); page.drawText(t, { x: width - x - bold.widthOfTextAtSize(t, 13), y: y + 18, size: 13, font: bold, color: ink }); }
  }
  const drawLogo = (page: PDFPage, logo: PDFImage, x: number, y: number, boxW: number, boxH: number) => {
    const ratio = Math.min(boxW / logo.width, boxH / logo.height);
    const width = logo.width * ratio;
    const height = logo.height * ratio;
    page.drawImage(logo, { x: x + (boxW - width) / 2, y: y + (boxH - height) / 2, width, height });
  };

  const drawStamp = (page: PDFPage) => {
    if (!stamp) return;
    const { width, height } = page.getSize();
    const s = Math.min(width, height) * 0.17;
    const r = Math.min(s / stamp.width, s / stamp.height);
    page.drawImage(stamp, { x: width - stamp.width * r - 36, y: height * 0.13 + 6, width: stamp.width * r, height: stamp.height * r, opacity: 0.92 });
  };

  // Load attachments first so the index can show page numbers.
  const loaded: { title: string; stamp: "all" | "divider" | "none"; parts: ({ pdf: PDFDoc; name: string } | { img: PDFImage; name: string })[]; pages: number }[] = [];
  for (const sec of input.sections) {
    const parts: ({ pdf: PDFDoc; name: string } | { img: PDFImage; name: string })[] = [];
    let pages = 0;
    for (const f of sec.files) {
      if (isPdf(f)) {
        try { const pdf = await PDFDocument.load(f.bytes, { ignoreEncryption: true }); parts.push({ pdf, name: f.name }); pages += pdf.getPageCount(); } catch { skipped.push(f.name); }
      } else if (isImg(f)) {
        const img = await embedImg(f);
        if (img) { parts.push({ img, name: f.name }); pages += 1; } else skipped.push(f.name);
      } else skipped.push(f.name);
    }
    loaded.push({ title: sec.title, stamp: sec.stamp ?? (input.stampEveryPage ? "all" : "divider"), parts, pages });
  }

  const appendSourcePages = async (source: Bg, label: string, kind: "cover" | "index") => {
    if ("pdf" in source) {
      const copied = await doc.copyPages(source.pdf, source.pdf.getPageIndices());
      copied.forEach((page, index) => {
        doc.addPage(page);
        labels.push({ label: copied.length > 1 ? `${label} ${index + 1}` : label, kind });
      });
      return copied.length;
    }
    const ratio = source.img.height / source.img.width;
    const width = DEFAULT_W, height = DEFAULT_W * ratio;
    const page = doc.addPage([width, height]);
    page.drawImage(source.img, { x: 0, y: 0, width, height });
    labels.push({ label, kind });
    return 1;
  };

  // ---------- Cover ----------
  let coverPageCount = 1;
  if (sourceCover) {
    // Client-supplied cover is source artwork: copy it exactly, no logos/fields/stamp/redraw.
    coverPageCount = await appendSourcePages(sourceCover, "Cover", "cover");
  } else {
    const cover = await newPage(coverBg);
    labels.push({ label: "Cover", kind: "cover" });
    const { width: coverW, height: coverH } = cover.getSize();
    const coverX = coverW * 0.08;
    const coverTop = coverH * 0.17;
    const coverBottom = coverH * 0.13;
    let y = coverH - coverTop;
    if (!input.useDefaultCover) drawLogos(cover);
    if (!input.useDefaultCover) {
      const heading = clean((input.coverLabel ?? input.kindLabel).toUpperCase());
      const headingSize = heading.length > 34 ? 17 : 21;
      cover.drawText(heading, { x: (coverW - bold.widthOfTextAtSize(heading, headingSize)) / 2, y: y - 24, size: headingSize, font: bold, color: coverBg ? ink : blue });
      y -= 54;
      if (input.title) {
        for (const l of wrap(input.title, bold, 14, coverW - 2 * coverX)) { cover.drawText(l, { x: (coverW - bold.widthOfTextAtSize(l, 14)) / 2, y: y - 14, size: 14, font: bold, color: ink }); y -= 19; }
      }
      y -= 28;
      const labelW = Math.min(150, coverW * 0.28);
      const coverFields = input.fields;
      for (const f of coverFields) {
        const vLines = wrap(f.value, bold, 10.5, coverW - 2 * coverX - labelW - 12);
        const lLines = wrap(f.label, bold, 10, labelW - 8);
        const rows = Math.max(vLines.length, lLines.length);
        const rowH = rows * 14 + 12;
        if (y - rowH < coverBottom + 20) break;
        lLines.forEach((l, i) => cover.drawText(`${l}${l.endsWith(":") ? "" : ":"}`, { x: coverX, y: y - 15 - i * 14, size: 10, font: bold, color: coverBg ? ink : blue }));
        vLines.forEach((l, i) => cover.drawText(l, { x: coverX + labelW, y: y - 15 - i * 14, size: 10.5, font: bold, color: ink }));
        y -= rowH;
      }
      if (input.stampCover !== false) drawStamp(cover);
    }
  }

  // ---------- Index ----------
  // Lay out complete section names before numbering pages, so long titles do not disappear.
  const [indexW, indexH] = sizeOf(indexBg);
  const indexMargin = indexW * 0.08;
  const indexTableW = indexW - 2 * indexMargin;
  const indexSrW = Math.max(44, indexW * 0.09);
  const indexPageW = Math.max(58, indexW * 0.12);
  const descriptionW = indexTableW - indexSrW - indexPageW - 18;
  const indexRows = input.sections.map((section, i) => {
    const lines = wrap(section.title.toUpperCase(), bold, 10, descriptionW);
    return { i, lines, rowH: Math.max(26, lines.length * 12 + 12) };
  });
  const indexTop = indexH - indexH * 0.24;
  const indexCapacity = indexTop - 30 - Math.max(60, indexH * 0.1);
  const indexPages: (typeof indexRows)[] = [[]];
  let remaining = indexCapacity;
  for (const row of indexRows) {
    const current = indexPages[indexPages.length - 1]!;
    if (current.length && (current.length >= 16 || row.rowH > remaining)) {
      indexPages.push([]);
      remaining = indexCapacity;
    }
    indexPages[indexPages.length - 1]!.push(row);
    remaining -= row.rowH;
  }
  const indexPageCount = sourceIndex
    ? ("pdf" in sourceIndex ? sourceIndex.pdf.getPageCount() : 1)
    : indexPages.length;
  let pageNo = coverPageCount + indexPageCount + 1; // source/generated cover + index pages, then first divider
  const starts = loaded.map((s) => { const start = pageNo; pageNo += 1 + s.pages; return start; });
  if (sourceIndex) {
    // Client-supplied index is copied exactly; parsed headings are used only to build divider order.
    await appendSourcePages(sourceIndex, "Index", "index");
  }
  for (let p = 0; !sourceIndex && p < indexPageCount; p++) {
    const page = await newPage(indexBg);
    labels.push({ label: indexPageCount > 1 ? `Index ${p + 1}` : "Index", kind: "index" });
    const { width, height } = page.getSize();
    const x = width * 0.08;
    const tableW = width - 2 * x;
    const srW = Math.max(44, width * 0.09);
    const pageW = Math.max(58, width * 0.12);

    if (!input.useDefaultIndex) drawLogos(page);
    const indexHeading = "INDEX";
    const indexHeadingSize = 19;
    page.drawText(indexHeading, { x: (width - bold.widthOfTextAtSize(indexHeading, indexHeadingSize)) / 2, y: height - height * 0.2, size: indexHeadingSize, font: bold, color: blue });
    const headText = rgb(1, 1, 1);
    let iy = height - height * 0.24;
    page.drawRectangle({ x, y: iy - 30, width: tableW, height: 30, color: skyBlue, borderColor: blue, borderWidth: 1 });
    page.drawLine({ start: { x: x + srW, y: iy }, end: { x: x + srW, y: iy - 30 }, color: blue, thickness: 0.8 });
    page.drawLine({ start: { x: width - x - pageW, y: iy }, end: { x: width - x - pageW, y: iy - 30 }, color: blue, thickness: 0.8 });
    page.drawText("SR. NO.", { x: x + 6, y: iy - 19, size: 9, font: bold, color: headText });
    page.drawText("DESCRIPTION", { x: x + srW + 9, y: iy - 19, size: 11, font: bold, color: headText });
    page.drawText("PAGE", { x: width - x - pageW + 14, y: iy - 19, size: 10, font: bold, color: headText });
    iy -= 30;
    for (const row of indexPages[p]!) {
      const { i, lines, rowH } = row;
      const rowFill = i % 2 === 0 ? paleBlue : softBlue;
      page.drawRectangle({ x, y: iy - rowH, width: srW, height: rowH, color: rowFill, borderColor: skyBlue, borderWidth: 0.65 });
      page.drawRectangle({ x: x + srW, y: iy - rowH, width: tableW - srW - pageW, height: rowH, color: rowFill, borderColor: skyBlue, borderWidth: 0.65 });
      page.drawRectangle({ x: width - x - pageW, y: iy - rowH, width: pageW, height: rowH, color: paleBlue, borderColor: skyBlue, borderWidth: 0.65 });
      const sr = String(i + 1);
      const numberY = iy - rowH / 2 - 3;
      page.drawText(sr, { x: x + srW / 2 - bold.widthOfTextAtSize(sr, 10) / 2, y: numberY, size: 10, font: bold, color: ink });
      lines.forEach((titleLine, lineIndex) => page.drawText(titleLine, { x: x + srW + 9, y: iy - 17 - lineIndex * 12, size: 10, font: bold, color: ink }));
      const pageText = String(starts[i] ?? "");
      page.drawText(pageText, { x: width - x - pageW / 2 - bold.widthOfTextAtSize(pageText, 10) / 2, y: numberY, size: 10, font: bold, color: blue });
      iy -= rowH;
    }
    if (input.stampIndex !== false) drawStamp(page);
  }

  // ---------- Dividers + documents ----------
  for (let i = 0; i < loaded.length; i++) {
    const s = loaded[i]!;
    const page = await newPage(dividerBg);
    labels.push({ label: `Divider ${i + 1}`, kind: "divider" });
    const { width, height } = page.getSize();
    const x = width * 0.08;
    const mid = height * 0.5;
    let dy = mid;
    for (const l of wrap(s.title.toUpperCase(), bold, 22, width - 2 * x)) {
      const textW = bold.widthOfTextAtSize(l, 22);
      page.drawText(l, { x: (width - textW) / 2, y: dy, size: 22, font: bold, color: ink });
      page.drawLine({ start: { x: (width - textW) / 2, y: dy - 3 }, end: { x: (width + textW) / 2, y: dy - 3 }, color: ink, thickness: 1 });
      dy -= 30;
    }
    drawLogos(page);
    if (s.stamp !== "none") drawStamp(page);

    for (const part of s.parts) {
      if ("pdf" in part) {
        const copied = await doc.copyPages(part.pdf, part.pdf.getPageIndices());
        copied.forEach((p, k) => {
          if (/\bmaterial\s+schedules?\b/i.test(s.title)) {
            const angle = ((p.getRotation().angle % 360) + 360) % 360;
            const { width, height } = p.getSize();
            const effectiveWidth = angle === 90 || angle === 270 ? height : width;
            const effectiveHeight = angle === 90 || angle === 270 ? width : height;
            if (effectiveWidth < effectiveHeight) p.setRotation(degrees((angle + 90) % 360));
          }
          doc.addPage(p);
          if (s.stamp === "all") drawStamp(p);
          labels.push({ label: `${i + 1}.${k + 1} ${part.name}`, kind: "doc" });
        });
      } else {
        const [width, height] = sizeOf(dividerBg);
        const p = doc.addPage([width, height]);
        const r = Math.min((width - 60) / part.img.width, (height - 60) / part.img.height);
        const w = part.img.width * r, h = part.img.height * r;
        p.drawImage(part.img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
        if (s.stamp === "all") drawStamp(p);
        labels.push({ label: `${i + 1} ${part.name}`, kind: "doc" });
      }
    }
  }

  // Clear, consistent numbering on the index, dividers and every attachment.
  const totalPages = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    if (i === 0) return;
    const { width } = p.getSize();
    const text = `PAGE ${i + 1} / ${totalPages}`;
    const textW = bold.widthOfTextAtSize(text, 10);
    const x = (width - textW) / 2;
    p.drawRectangle({ x: x - 12, y: 10, width: textW + 24, height: 24, color: rgb(1, 1, 1), opacity: 0.94, borderColor: line, borderWidth: 0.5 });
    p.drawText(text, { x, y: 17, size: 10, font: bold, color: blue });
  });

  return { bytes: await doc.save(), labels, skipped };
}
