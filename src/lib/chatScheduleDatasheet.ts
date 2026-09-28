import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FanDatabase, FanDimension, FanSelection } from './fanData';
import { generateDatasheetForSelection } from './chatDatasheet';
import { generateAirCurtainDatasheet } from './airCurtainDatasheet';
import type {
  AirCurtainSelection,
  AirCurtainBrand,
  AirCurtainSeries,
  AirCurtainDimensionRow,
} from './airCurtainData';

export type SourceProposed = Partial<Record<'model' | 'airflow' | 'esp' | 'fan_rpm' | 'motor_rpm' | 'power' | 'electrical' | 'length' | 'installation_height' | 'velocity', string | null>>;
// A supplied proposed column is authoritative, including its intentionally blank cells.
export const proposedCell = (source: SourceProposed | undefined, key: keyof SourceProposed, fallback: string): string =>
  source ? String(source[key] ?? '') : fallback;

export interface ChatScheduleFanRow {
  tag: string;
  quantity: number;
  duty: string;
  selection: FanSelection;
  airflowUnit?: string;
  pressureUnit?: string;
  specified?: {
    areaServed?: string; location?: string; building?: string; electrical?: string;
    powerW?: number | null; airflow?: number | null; airflowUnit?: string;
    staticPressure?: number | null; pressureUnit?: string; motorRpm?: number | null; fanRpm?: number | null;
  };
  sourceProposed?: SourceProposed;
  accessories?: string;
  remarks?: string;
}

export interface ChatScheduleAirCurtainRow {
  tag: string;
  quantity: number;
  duty: string;
  /** Display label, e.g. "1 x FM-1220N-2(Y) (2000mm)" */
  label: string;
  selection: AirCurtainSelection;
  doorWidthMm: number;
  doorHeightM: number;
  minFloorVelocity: number;
  noiseMode?: 'dba' | 'octave';
  airflowUnit?: 'cmh' | 'cfm' | 'ls';
  widthUnit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  heightUnit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  specified?: { doorWidthMm?: number | null; doorHeightMm?: number | null };
  sourceProposed?: SourceProposed;
  accessories?: string;
  remarks?: string;
}

export interface ChatScheduleAirCurtainContext {
  brands: AirCurtainBrand[];
  series: AirCurtainSeries[];
  dimensions: AirCurtainDimensionRow[];
}

interface ChatScheduleDatasheetOptions {
  title: string;
  rows: ChatScheduleFanRow[];
  database: FanDatabase;
  dimensionsMap?: Map<string, FanDimension>;
  companyName?: string | null;
  logoUrl?: string | null;
  brandLogoUrl?: string | null;
  projectDetails?: { label: string; value: string }[];
  airCurtainRows?: ChatScheduleAirCurtainRow[];
  airCurtainContext?: ChatScheduleAirCurtainContext;
  unresolvedRows?: string[][];
}

const schedulePageCounts = new WeakMap<jsPDF, number>();
export const getSchedulePageCount = (doc: jsPDF) => schedulePageCounts.get(doc) ?? 1;

export function cleanScheduleRemarks(value?: string): string {
  return (value ?? '').split(/;\s*/).filter(part => !/^(?:source\s+(?:lists|shows|states)|highlighted\s+combined|AI\s+(?:inferred|interpreted)|interpreted\s+as)/i.test(part.trim())).join('; ').trim();
}
const BLUE: [number, number, number] = [16, 106, 237];
const TEXT: [number, number, number] = [35, 43, 56];
const MUTED: [number, number, number] = [100, 116, 139];

export function electricalRating(value?: string): string {
  return (value ?? '').replace(/\bV\s*\/\s*Ph\s*\/\s*Hz\b/gi, '')
    .replace(/\b(?:volts?|voltage|phases?|frequency)\b/gi, '')
    .replace(/(?:V|PH|HZ)\b/gi, '').replace(/\s*\/\s*/g, '/')
    .replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '').replace(/\s+/g, ' ').trim();
}

export function airElectricalRating(voltage: string | null | undefined, frequency: number, modelCode?: string): string {
  // Confirmed single-phase catalogue models; never infer phase from voltage alone.
  const knownSinglePhase = /^FM-(?:451[28]|4520XD|1215N|1220N)(?:[-(]|$)/i.test(modelCode ?? "");
  const phase = knownSinglePhase ? "1" : "—";
  const clean = electricalRating(voltage);
  if (!clean) return `—/${phase}/${frequency}`;
  const parts = clean.split('/');
  if (parts.length >= 3) return parts.slice(0, 3).join('/');
  if (parts.length === 2) return Number(parts[1]) > 3 ? `${parts[0]}/${phase}/${parts[1]}` : `${clean}/${frequency}`;
  return `${clean}/${phase}/${frequency}`;
}

export function proposedDutyCell(value: number, unit: string | undefined, kind: 'airflow' | 'pressure'): string {
  const key = (unit ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const factors: Record<string, [number, string]> = kind === 'airflow'
    ? { cmh: [1, 'CMH'], m3h: [1, 'm³/h'], cfm: [1.6990107955, 'CFM'], lps: [3.6, 'L/s'], ls: [3.6, 'L/s'], cms: [3600, 'm³/s'], m3s: [3600, 'm³/s'] }
    : { pa: [1, 'Pa'], mmwg: [9.80665, 'mmwg'], inwg: [249.08891, 'inwg'] };
  const [factor, label] = factors[key] ?? (kind === 'airflow' ? [1, 'CMH'] : [1, 'Pa']);
  return `${Number((value / factor).toFixed(3))} ${label}`;
}

type RGB = [number, number, number];

// Ignore the logo background and prefer its dominant coloured ink over dark lettering.
export function schedulePalette(pixels: ArrayLike<number>) {
  const bins = new Map<string, { count: number; sum: RGB; chromatic: boolean }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 128 || Math.min(r, g, b) > 235) continue;
    const key = [r, g, b].map(v => Math.floor(v / 32)).join(',');
    const bin = bins.get(key) ?? { count: 0, sum: [0, 0, 0] as RGB, chromatic: Math.max(r, g, b) - Math.min(r, g, b) > 40 };
    bin.count++; bin.sum[0] += r; bin.sum[1] += g; bin.sum[2] += b; bins.set(key, bin);
  }
  const all = [...bins.values()];
  const coloured = all.filter(b => b.chromatic);
  const dominant = (coloured.length ? coloured : all).sort((a, b) => b.count - a.count)[0];
  const primary: RGB = dominant ? dominant.sum.map(v => Math.round(v / dominant.count)) as RGB : [...BLUE];
  const luminance = primary.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const light = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722;
  return { primary, ink: (light > 0.179 ? [0, 0, 0] : [255, 255, 255]) as RGB,
    tint: primary.map(v => Math.round(v * 0.12 + 255 * 0.88)) as RGB };
}

async function logoPalette(data: string | null) {
  const fallback = schedulePalette([]);
  if (!data || typeof document === 'undefined' || typeof Image === 'undefined') return fallback;
  try {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(image, 0, 0, 96, 96);
    return schedulePalette(ctx.getImageData(0, 0, 96, 96).data);
  } catch { return fallback; }
}

async function loadImage(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildCombinedScheduleDatasheet({
  title,
  rows,
  database,
  dimensionsMap,
  companyName,
  logoUrl,
  brandLogoUrl,
  projectDetails = [],
  airCurtainRows = [],
  airCurtainContext,
  unresolvedRows = [],
}: ChatScheduleDatasheetOptions): Promise<jsPDF> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const brandName = companyName || database.companyName || 'KINAIR';
  const logo = await loadImage(logoUrl || database.logoUrl);
  const brandLogo = await loadImage(brandLogoUrl);
  const palette = await logoPalette(brandLogo);

  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageW, 118, 'F');
  if (logo) {
    try {
      doc.addImage(logo, logo.includes('image/png') ? 'PNG' : 'JPEG', pageW / 2 - 40, 30, 80, 25);
    } catch {
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(30);
      doc.text(brandName, pageW / 2, 50, { align: 'center' });
    }
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.text(brandName, pageW / 2, 50, { align: 'center' });
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('COMBINED TECHNICAL DATASHEETS', pageW / 2, 82, { align: 'center' });

  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(title, pageW - 40);
  doc.text(titleLines, pageW / 2, 150, { align: 'center' });
  const titleHeight = titleLines.length * 9;
  const totalUnits =
    rows.reduce((sum, row) => sum + row.quantity, 0) +
    airCurtainRows.reduce((sum, row) => sum + row.quantity, 0);
  const totalItems = rows.length + airCurtainRows.length;
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${totalItems} selected items · ${totalUnits} units`, pageW / 2, 160 + titleHeight, {
    align: 'center',
  });
  doc.text(`Generated ${new Date().toLocaleDateString('en-GB')}`, pageW / 2, pageH - 22, { align: 'center' });
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(3);
  doc.line(0, pageH - 10, pageW, pageH - 10);

  doc.addPage('a4', 'landscape');
  const scheduleW = doc.internal.pageSize.getWidth();

  // Match the cover's 170 x 64 pt logo boxes without stretching either image.
  const drawScheduleLogos = () => {
    const boxW = 170 * 25.4 / 72, boxH = 64 * 25.4 / 72;
    const inset = scheduleW * 0.08;
    for (const [data, x] of [[logo, inset], [brandLogo, scheduleW - inset - boxW]] as const) {
      if (!data) continue;
      try {
        const image = doc.getImageProperties(data);
        const ratio = Math.min(boxW / image.width, boxH / image.height);
        const width = image.width * ratio, height = image.height * ratio;
        doc.addImage(data, image.fileType, x + (boxW - width) / 2, 6 + (boxH - height) / 2, width, height);
      } catch { /* An unavailable logo must not prevent PDF generation. */ }
    }
  };
  drawScheduleLogos();
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(rows.length && airCurtainRows.length ? 'ANNEXURE - MATERIAL SCHEDULE' : rows.length ? 'ANNEXURE - FANS SCHEDULE' : airCurtainRows.length ? 'ANNEXURE - AIR CURTAINS SCHEDULE' : 'ANNEXURE - MATERIAL SCHEDULE', scheduleW / 2, 37, { align: 'center' });

  const visibleProjectDetails = projectDetails.filter((field) => field.label?.trim() && field.value?.trim());
  let scheduleStartY = 44;
  if (visibleProjectDetails.length) {
    const half = Math.ceil(visibleProjectDetails.length / 2);
    doc.setFontSize(7);
    visibleProjectDetails.forEach((field, index) => {
      const right = index >= half;
      const row = right ? index - half : index;
      const x = right ? scheduleW / 2 + 4 : 8;
      const y = 46 + row * 6;
      doc.setFont('helvetica', 'bold');
      doc.text(`${field.label}:`, x, y);
      doc.setFont('helvetica', 'normal');
      const labelW = Math.min(38, doc.getTextWidth(`${field.label}:`) + 3);
      const value = String(field.value);
      doc.text(doc.splitTextToSize(value, scheduleW / 2 - labelW - 14), x + labelW, y);
    });
    scheduleStartY = 50 + Math.max(half, visibleProjectDetails.length - half) * 6;
  }

  // The assembler uses a 24 mm stamp, 8 mm from the bottom/right edge.
  // Reserve 38 mm including clearance, so table rows cannot overlap it.
  if (rows.length) {
    autoTable(doc, {
      startY: scheduleStartY,
      head: [
        [
          { content: 'Item Tag / Ref. No.', rowSpan: 2 },
          { content: 'Specified', colSpan: 9, styles: { fillColor: palette.tint, textColor: TEXT } },
          { content: 'Proposed', colSpan: 10, styles: { fillColor: palette.primary, textColor: palette.ink } },
        ],
        ['Area Served', 'Location', 'Building', 'Electrical (V/Ph/Hz)', 'Power (W)', 'Airflow (unit shown)', 'ESP (unit shown)', 'Motor Speed (rpm)', 'Fan Speed (rpm)',
         'Model', 'Airflow (unit shown)', 'ESP (unit shown)', 'Fan Speed (rpm)', 'Motor Speed (rpm)', 'Power (unit shown)', 'Electrical (V/Ph/Hz)', 'Qty (Nos.)', 'Accessories Proposed', 'Remarks'],
      ],
      didParseCell: (data) => {
        if (data.section === 'head' && data.row.index === 1 && data.column.index >= 1 && data.column.index <= 9) {
          data.cell.styles.fillColor = palette.tint; data.cell.styles.textColor = TEXT;
        }
      },
      body: rows.map((row) => [
        row.tag,
        row.specified?.areaServed ?? '',
        row.specified?.location ?? '',
        row.specified?.building ?? '',
        electricalRating(row.specified?.electrical),
        row.specified?.powerW == null ? '' : String(row.specified.powerW),
        row.specified?.airflow == null ? '' : `${row.specified.airflow} ${row.specified.airflowUnit ?? ''}`.trim(),
        row.specified?.staticPressure == null ? '' : `${row.specified.staticPressure} ${row.specified.pressureUnit ?? ''}`.trim(),
        row.specified?.motorRpm == null ? '' : String(row.specified.motorRpm),
        row.specified?.fanRpm == null ? '' : String(row.specified.fanRpm),
        proposedCell(row.sourceProposed, 'model', row.selection.nomenclature),
        proposedCell(row.sourceProposed, 'airflow', proposedDutyCell(row.selection.operatingPoint.airflow, row.specified?.airflowUnit ?? row.airflowUnit, 'airflow')),
        proposedCell(row.sourceProposed, 'esp', proposedDutyCell(row.selection.operatingPoint.staticPressure, row.specified?.pressureUnit ?? row.pressureUnit, 'pressure')),
        proposedCell(row.sourceProposed, 'fan_rpm', ''),
        proposedCell(row.sourceProposed, 'motor_rpm', ''),
        proposedCell(row.sourceProposed, 'power', `${Math.round(row.selection.motorRating * 1000 * 100) / 100} W`),
        proposedCell(row.sourceProposed, 'electrical', ''),
        String(row.quantity),
        row.accessories || '-',
        row.sourceProposed ? (row.remarks ?? '') : cleanScheduleRemarks(row.remarks),
      ]),
      foot: [[{ content: 'TOTAL QUANTITY (Nos.)', colSpan: 17 }, String(rows.reduce((sum, row) => sum + row.quantity, 0)), '', '']],
      showFoot: 'lastPage', footStyles: { fillColor: palette.tint, textColor: TEXT, halign: 'center', valign: 'middle' },
      theme: 'grid',
      headStyles: { fillColor: palette.primary, textColor: palette.ink, fontSize: 5.7, cellPadding: 1.2, halign: 'center', valign: 'middle' },
      styles: { lineWidth: 0.15, lineColor: [145, 155, 170], fontSize: 5.4, cellPadding: 1.1, textColor: TEXT, halign: 'center', valign: 'middle' },
      margin: { left: 5, right: 5, top: 35, bottom: 38 },
    });
  }
  if (airCurtainRows.length) {
    if (rows.length) { doc.addPage("a4", "landscape"); scheduleStartY = 35; }
    autoTable(doc, {
      startY: scheduleStartY,
      head: [
        [
          { content: 'Item Tag / Ref. No.', rowSpan: 2 },
          { content: 'Specified', colSpan: 2, styles: { fillColor: palette.tint, textColor: TEXT } },
          { content: 'Proposed', colSpan: 10, styles: { fillColor: palette.primary, textColor: palette.ink } },
        ],
        ['Door Opening Width (mm)', 'Door Opening Height (mm)', 'Model', 'Airflow (unit shown)', 'Air Curtain Length (unit shown)',
         'Installation Height (unit shown)', 'Air Velocity (unit shown)', 'Power (unit shown)', 'Electrical (V/Ph/Hz)', 'Qty (Nos.)', 'Accessories Offered', 'Remarks'],
      ],
      didParseCell: (data) => {
        if (data.section === 'head' && data.row.index === 1 && data.column.index >= 1 && data.column.index <= 2) {
          data.cell.styles.fillColor = palette.tint; data.cell.styles.textColor = TEXT;
        }
      },
      body: airCurtainRows.map((row) => [
        row.tag,
        row.specified?.doorWidthMm == null ? '' : String(Math.round(row.specified.doorWidthMm)),
        row.specified?.doorHeightMm == null ? '' : String(Math.round(row.specified.doorHeightMm)),
        proposedCell(row.sourceProposed, 'model', row.label),
        proposedCell(row.sourceProposed, 'airflow', `${Math.round(row.selection.totalAirVolumeCfm)} CFM`),
        proposedCell(row.sourceProposed, 'length', `${Math.round(row.selection.totalLengthMm)} mm`),
        proposedCell(row.sourceProposed, 'installation_height', Number.isFinite(row.doorHeightM) ? `${Math.round(row.doorHeightM * 1000) / 1000} m` : ''),
        proposedCell(row.sourceProposed, 'velocity', `${Math.round(row.selection.outletVelocity * 10) / 10} m/s`),
        proposedCell(row.sourceProposed, 'power', `${Math.round(row.selection.totalPowerW) / 1000} kW`),
        proposedCell(row.sourceProposed, 'electrical', airElectricalRating(row.selection.voltage, row.selection.supplyFrequencyHz, row.selection.model.model)),
        String(row.quantity),
        row.accessories || '-',
        row.sourceProposed ? (row.remarks ?? '') : cleanScheduleRemarks(row.remarks),
      ]),
      foot: [[{ content: 'TOTAL QUANTITY (Nos.)', colSpan: 10 }, String(airCurtainRows.reduce((sum, row) => sum + row.quantity, 0)), '', '']],
      showFoot: 'lastPage', footStyles: { fillColor: palette.tint, textColor: TEXT, halign: 'center', valign: 'middle' },
      theme: 'grid',
      headStyles: { fillColor: palette.primary, textColor: palette.ink, fontSize: 6, cellPadding: 1.2, halign: 'center', valign: 'middle' },
      styles: { lineWidth: 0.15, lineColor: [145, 155, 170], fontSize: 5.8, cellPadding: 1.1, textColor: TEXT, halign: 'center', valign: 'middle' },
      margin: { left: 5, right: 5, top: 35, bottom: 38 },
    });
  }
  if (unresolvedRows.length) {
    if (rows.length || airCurtainRows.length) doc.addPage('a4', 'landscape');
    doc.setFontSize(10); doc.setTextColor(...TEXT);
    if (rows.length || airCurtainRows.length) doc.text('MATERIAL SCHEDULE - ITEMS REQUIRING TDS REVIEW', scheduleW / 2, 33, { align: 'center' });
    autoTable(doc, { startY: Math.max(39, rows.length || airCurtainRows.length ? 39 : scheduleStartY),
      head: [['Item / Tag', 'Product', 'Supplied Model', 'Qty', 'Specified Duty', 'Location / Area', 'Review']],
      body: unresolvedRows, theme: 'grid', margin: { left: 8, right: 8, top: 35, bottom: 38 },
      headStyles: { fillColor: palette.primary, textColor: palette.ink, fontSize: 8 }, styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', halign: 'center', valign: 'middle' },
    });
  }
  for (let page = 2; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    const borderW = doc.internal.pageSize.getWidth();
    const borderH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...palette.primary);
    doc.setLineWidth(0.55); doc.rect(2, 2, borderW - 4, borderH - 4);
    doc.setLineWidth(0.15); doc.rect(3, 3, borderW - 6, borderH - 6);
    if (page === 2) continue;
    drawScheduleLogos();
  }
  schedulePageCounts.set(doc, doc.getNumberOfPages() - 1);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    await generateDatasheetForSelection(
      row.selection,
      database,
      { airflowUnit: row.airflowUnit, pressureUnit: row.pressureUnit },
      dimensionsMap,
      { existingDoc: doc, skipSave: true, pageLabel: `Fan ${index + 1} of ${rows.length}`, referenceNo: row.tag },
    );
  }

  for (const row of airCurtainRows) {
    const selection = row.selection;
    const seriesInfo = airCurtainContext?.series.find((s) => s.id === selection.model.seriesId) ?? null;
    const brandInfo =
      airCurtainContext?.brands.find((b) => b.id === (selection.model.brandId ?? seriesInfo?.brandId)) ??
      airCurtainContext?.brands.find((b) => b.name === selection.model.brand) ??
      null;
    const airflowUnit = row.airflowUnit ?? 'cmh';
    const airflowUnitLabel = airflowUnit === 'cfm' ? 'CFM' : airflowUnit === 'ls' ? 'LPS' : 'CMH';
    const widthUnit = row.widthUnit ?? 'mm';
    const heightUnit = row.heightUnit ?? 'm';
    const lengthFactors = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 } as const;
    const lengthLabels = { mm: 'mm', cm: 'cm', m: 'm', in: 'in', ft: 'ft' } as const;
    await generateAirCurtainDatasheet({
      selection,
      doorWidthMm: row.doorWidthMm,
      doorHeightM: row.doorHeightM,
      minFloorVelocity: row.minFloorVelocity,
      brandInfo,
      seriesInfo,
      dimensions:
        airCurtainContext?.dimensions.filter(
          (d) =>
            (seriesInfo && d.seriesId === seriesInfo.id) ||
            selection.units.some((u) => u.model.id === d.modelId || u.model.seriesId === d.seriesId),
        ) ?? [],
      companyLogoUrl: logoUrl ?? null,
      companyName: brandName,
      noiseMode: row.noiseMode ?? 'dba',
      airflowUnit,
      airflowUnitLabel,
      lengthUnitFactorMm: lengthFactors[widthUnit],
      lengthUnitLabel: lengthLabels[widthUnit],
      heightUnitFactorMm: lengthFactors[heightUnit],
      heightUnitLabel: lengthLabels[heightUnit],
      existingDoc: doc,
      referenceNo: row.tag,
    });
  }

  return doc;
}

export async function downloadCombinedScheduleDatasheet(options: ChatScheduleDatasheetOptions): Promise<void> {
  const doc = await buildCombinedScheduleDatasheet(options);
  const safeTitle = options.title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Fan_Schedule';
  doc.save(`${safeTitle}_Combined_Datasheets.pdf`);
}
