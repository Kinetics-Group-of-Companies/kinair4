import { buildWithRtcc, type RtccBuildRound } from "./rtcc-pdf";
import { coverFieldKey, normalizeCoverFields } from "./cover-fields";
import type { PDFDocument as PDFDoc, PDFFont, PDFImage, PDFPage } from "pdf-lib";

export type FileData = { id?: string; bytes: ArrayBuffer; type: string; name: string };
export type BuildInput = {
  rtcc?: RtccBuildRound[];
  pageOffset?: number;
  kindLabel: string;
  coverLabel?: string | undefined;
  title: string;
  companyName?: string | undefined;
  brandName?: string | undefined;
  productName?: string | undefined;
  fields: { label: string; value: string }[];
  sections: { title: string; notApplicableReason?: string; files: FileData[]; stamp?: "all" | "divider" | "none" | undefined }[];
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
export type PageLabel = { docId?: string; label: string; kind: "cover" | "index" | "divider" | "doc" };

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
  if (input.rtcc?.length) return buildWithRtcc(input, buildSubmittalPdf);
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

  const drawStamp = (page: PDFPage, compactSchedule = false) => {
    if (!stamp) return;
    const { width, height } = page.getSize();
    const s = compactSchedule ? 68 : Math.min(width, height) * 0.17;
    const r = Math.min(s / stamp.width, s / stamp.height);
    page.drawImage(stamp, { x: width - stamp.width * r - (compactSchedule ? 23 : 36), y: compactSchedule ? 23 : height * 0.13 + 6, width: stamp.width * r, height: stamp.height * r, opacity: 0.92 });
  };

  const attachmentFooters = new WeakMap<PDFPage, { x: number; y: number; width: number }>();
  const addAttachmentFooter = (page: PDFPage, withStamp: boolean) => {
    // Keep the original source-page dimensions. Stamps and page numbers are
    // overlaid inside the existing page; never add a separate footer band.
    const box = page.getCropBox();
    attachmentFooters.set(page, { x: box.x, y: box.y, width: box.width });
    if (withStamp && stamp) {
      const maxStamp = Math.min(72, box.width * 0.14, box.height * 0.11);
      const ratio = Math.min(maxStamp / stamp.width, maxStamp / stamp.height);
      const stampW = stamp.width * ratio, stampH = stamp.height * ratio;
      page.drawImage(stamp, {
        x: box.x + box.width - stampW - 18,
        y: box.y + 18,
        width: stampW,
        height: stampH,
        opacity: 0.88
      });
    }
  };

  // Load attachments first so the index can show page numbers.
  const loaded: { title: string; notApplicableReason?: string; stamp: "all" | "divider" | "none"; parts: ({ pdf: PDFDoc; name: string; id?: string } | { img: PDFImage; name: string; id?: string })[]; pages: number }[] = [];
  const isMaterialScheduleSection = (title:string) => /\bmaterial\s+schedules?\b|\bschedule\s+of\s+materials?\b/i.test(title);
  const normalizeMaterialScheduleOrientation = (page:PDFPage) => {
    const {width,height}=page.getSize();
    const angle=((page.getRotation().angle%360)+360)%360;
    const rotated=angle===90||angle===270;
    const displayedWidth=rotated?height:width;
    const displayedHeight=rotated?width:height;
    if(displayedWidth<displayedHeight) page.setRotation(degrees((angle+90)%360));
  };
  for (const sec of input.sections) {
    const parts: ({ pdf: PDFDoc; name: string; id?: string } | { img: PDFImage; name: string; id?: string })[] = [];
    let pages = 0;
    for (const f of sec.files) {
      if (isPdf(f)) {
        try { const pdf = await PDFDocument.load(f.bytes, { ignoreEncryption: true }); parts.push({ pdf, name: f.name, id: f.id }); pages += pdf.getPageCount(); } catch { skipped.push(f.name); }
      } else if (isImg(f)) {
        const img = await embedImg(f);
        if (img) { parts.push({ img, name: f.name, id: f.id }); pages += 1; } else skipped.push(f.name);
      } else skipped.push(f.name);
    }
    loaded.push({ title: sec.title, notApplicableReason: sec.files.length ? undefined : sec.notApplicableReason, stamp: sec.stamp ?? (input.stampEveryPage ? "all" : "divider"), parts, pages });
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
      const headingSize = Math.min(heading.length > 34 ? 17 : 21, (coverW - 2 * coverX) / Math.max(1, bold.widthOfTextAtSize(heading, 1)));
      cover.drawText(heading, { x: (coverW - bold.widthOfTextAtSize(heading, headingSize)) / 2, y: y - 24, size: headingSize, font: bold, color: coverBg ? ink : blue });
      y -= 54;
      const coverFields = normalizeCoverFields(input.fields);
      const hasProject = coverFields.some(field => coverFieldKey(field.label) === "projectname");
      if (input.title && !hasProject) {
        for (const l of wrap(input.title, bold, 14, coverW - 2 * coverX)) { cover.drawText(l, { x: coverX, y: y - 14, size: 14, font: bold, color: ink }); y -= 19; }
      }
      y -= 18;
      const supplierKeys = new Set(["suppliername", "brandname", "product", "producttype", "equipment", "model", "series"]);
      const projectFields = coverFields.filter(field => !supplierKeys.has(coverFieldKey(field.label)));
      const supplyFields = coverFields.filter(field => supplierKeys.has(coverFieldKey(field.label)));
      const tablePage = cover;
      const tableW = coverW - 2 * coverX;
      const labelW = tableW * 0.32;
      // Measure both tables together before drawing so the cover stays one page.
      const availableHeight = y - (stamp && input.stampCover !== false ? coverBottom + 115 : coverBottom);
      let scale = 1;
      const heightAt = (factor: number) => [projectFields, supplyFields].reduce((total, fields) => {
        if (!fields.length) return total;
        return total + 47 * factor + fields.reduce((height, field) => height +
          Math.max(wrap(field.label.replace(/:$/, ""), bold, 9.5 * factor, labelW - 24 * factor).length,
            wrap(field.value, font, 10 * factor, tableW - labelW - 24 * factor).length) * 14 * factor + 20 * factor, 0);
      }, 0);
      while (heightAt(scale) > availableHeight && scale > 0.1) scale *= 0.95;
      const table = async (heading: string, fields: typeof coverFields) => {
        if (!fields.length) return;
        const header = () => {
          tablePage.drawRectangle({ x: coverX, y: y - 27 * scale, width: tableW, height: 27 * scale, color: blue });
          tablePage.drawText(heading, { x: coverX + 12 * scale, y: y - 18 * scale, font: bold, size: 10 * scale, color: rgb(1, 1, 1) });
          y -= 27 * scale;
        };
        header();
        for (const [index, field] of fields.entries()) {
          const names = wrap(field.label.replace(/:$/, ""), bold, 9.5 * scale, labelW - 24 * scale);
          const values = wrap(field.value, font, 10 * scale, tableW - labelW - 24 * scale);
          const rowH = Math.max(names.length, values.length) * 14 * scale + 20 * scale;
          tablePage.drawRectangle({ x: coverX, y: y - rowH, width: tableW, height: rowH, color: index % 2 ? rgb(1, 1, 1) : softBlue, borderColor: line, borderWidth: 0.5 });
          tablePage.drawLine({ start: { x: coverX + labelW, y }, end: { x: coverX + labelW, y: y - rowH }, color: line, thickness: 0.5 });
          names.forEach((text, i) => tablePage.drawText(text, { x: coverX + 12 * scale, y: y - 21 * scale - i * 14 * scale, size: 9.5 * scale, font: bold, color: blue }));
          values.forEach((text, i) => tablePage.drawText(text, { x: coverX + labelW + 12 * scale, y: y - 21 * scale - i * 14 * scale, size: 10 * scale, font, color: ink }));
          y -= rowH;
        }
        y -= 20 * scale;
      };
      await table("PROJECT DETAILS", projectFields);
      await table("SUPPLIER & PRODUCT DETAILS", supplyFields);
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
  let pageNo = (input.pageOffset || 0) + coverPageCount + indexPageCount + 1; // source/generated cover + index pages, then first divider
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
    if (s.notApplicableReason) {
      dy -= 20;
      for (const line of wrap("NOT APPLICABLE: " + s.notApplicableReason, font, 11, width - 2 * x)) {
        page.drawText(line, {x, y:dy, size:11, font, color:ink}); dy -= 16;
      }
    }
    drawLogos(page);
    if (s.stamp !== "none") drawStamp(page);

    const isCatalogueSection = /\bcatalog(?:ue|og)s?\b/i.test(s.title);
    const hasDedicatedXdCatalogue = isCatalogueSection && s.parts.some((part) =>
      /\bXD[\s_-]*Centrifugal\b/i.test(part.name));
    for (const part of s.parts) {
      if ("pdf" in part) {
        let pageIndices = part.pdf.getPageIndices();
        // The saved N-Centrifugal catalogue is a legacy 2-page combined file
        // whose second page overlaps the separately saved XD catalogue. When
        // both dedicated catalogues are selected, keep only the N-Centrifugal
        // page here so XD appears exactly once.
        if (hasDedicatedXdCatalogue
          && /\bN[\s_-]*Centrifugal\b/i.test(part.name)
          && !/\bXD[\s_-]*Centrifugal\b/i.test(part.name)
          && pageIndices.length > 1) {
          pageIndices = [pageIndices[0]!];
        }
        const copied = await doc.copyPages(part.pdf, pageIndices);
        copied.forEach((p, k) => {
          // Only Material Schedule pages are auto-normalized. If the effective
          // page is portrait/sideways, rotate it to landscape for readable tables.
          // All other submitted documents preserve their original orientation.
          if (isMaterialScheduleSection(s.title)) normalizeMaterialScheduleOrientation(p);
          doc.addPage(p);
          if (isMaterialScheduleSection(s.title) || /^KINAIR-Material-Schedule(?:\.|$)/i.test(part.name)) {
            if (s.stamp === "all") drawStamp(p, true);
          } else addAttachmentFooter(p, s.stamp === "all");
          labels.push({ label: `${i + 1}.${k + 1} ${part.name}`, kind: "doc", docId: part.id });
        });
      } else {
        let [width, height] = sizeOf(dividerBg);
        if (isMaterialScheduleSection(s.title) && width < height && part.img.width >= part.img.height) [width,height]=[height,width];
        const p = doc.addPage([width, height]);
        const r = Math.min((width - 60) / part.img.width, (height - 60) / part.img.height);
        const w = part.img.width * r, h = part.img.height * r;
        p.drawImage(part.img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
        addAttachmentFooter(p, s.stamp === "all");
        labels.push({ label: `${i + 1} ${part.name}`, kind: "doc", docId: part.id });
      }
    }
  }

  // Clear, consistent numbering on the index, dividers and every attachment.
  const totalPages = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    if (i === 0) return;
    const footer = attachmentFooters.get(p);
    const width = footer?.width ?? p.getSize().width;
    const offsetX = footer?.x ?? 0, offsetY = footer?.y ?? 0;
    const text = `PAGE ${i + 1 + (input.pageOffset || 0)} / ${totalPages + (input.pageOffset || 0)}`;
    const textW = bold.widthOfTextAtSize(text, 10);
    const x = offsetX + (width - textW) / 2;
    p.drawRectangle({ x: x - 12, y: offsetY + 10, width: textW + 24, height: 24, color: rgb(1, 1, 1), opacity: 0.94, borderColor: line, borderWidth: 0.5 });
    p.drawText(text, { x, y: offsetY + 17, size: 10, font: bold, color: blue });
  });

  return { bytes: await doc.save(), labels, skipped };
}


