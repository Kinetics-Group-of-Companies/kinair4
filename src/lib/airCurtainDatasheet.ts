import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CATEGORY_LABELS,
  
  effectiveThrow,
  jetVelocityAt,
  slotWidthOf,
  type AirCurtainSelection,
  type AirCurtainBrand,
  type AirCurtainSeries,
  type AirCurtainDimensionRow,
} from '@/lib/airCurtainData';

export interface AirCurtainDatasheetInput {
  selection: AirCurtainSelection;
  doorWidthMm: number;
  doorHeightM: number;
  minFloorVelocity: number;
  brandInfo?: AirCurtainBrand | null;
  seriesInfo?: AirCurtainSeries | null;
  dimensions?: AirCurtainDimensionRow[];
  projectName?: string;
  clientName?: string;
  companyLogoUrl?: string | null;
  companyName?: string;
  contactInfo?: { phone?: string; email?: string } | null;
  /** 'dba' = single overall level only, 'octave' = add the octave band table */
  noiseMode?: 'dba' | 'octave';
  /** Airflow unit chosen in the selector: 'cmh' | 'cfm' | 'ls' */
  airflowUnit?: 'cmh' | 'cfm' | 'ls';
  /** Display label for the chosen airflow unit, e.g. 'l/s' */
  airflowUnitLabel?: string;
  /** mm per chosen door-length unit (1 = mm, 10 = cm, 1000 = m, 25.4 = inch) */
  lengthUnitFactorMm?: number;
  lengthUnitLabel?: string;
  /** mm per chosen door-height unit */
  heightUnitFactorMm?: number;
  heightUnitLabel?: string;
  /** Append the datasheet to an existing document instead of creating one */
  existingDoc?: jsPDF;
}

const COLORS = {
  text: [40, 40, 40] as [number, number, number],
  textLight: [100, 100, 100] as [number, number, number],
  border: [220, 220, 220] as [number, number, number],
  head: [45, 45, 45] as [number, number, number],
  accent: [16, 106, 237] as [number, number, number],
};

async function loadImage(url: string): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 1, height: 1 });
      img.src = base64;
    });
    return { base64, ...size };
  } catch {
    return null;
  }
}

function fmt(base64: string) {
  return base64.includes('image/png') ? 'PNG' : 'JPEG';
}

function fit(img: { width: number; height: number }, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * ratio, h: img.height * ratio };
}

export async function generateAirCurtainDatasheet(input: AirCurtainDatasheetInput): Promise<jsPDF> {
  const {
    selection,
    doorWidthMm,
    doorHeightM,
    minFloorVelocity,
    brandInfo,
    seriesInfo,
    dimensions = [],
    projectName,
    clientName,
    companyLogoUrl,
    companyName,
    contactInfo,
    noiseMode = 'dba',
    airflowUnit = 'cmh',
    airflowUnitLabel,
    lengthUnitFactorMm = 1,
    lengthUnitLabel = 'mm',
    heightUnitFactorMm = 1000,
    heightUnitLabel = 'm',
  } = input;

  const roundSmart = (v: number): number =>
    Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  /** mm value shown in the door-length unit picked in the selector */
  const lenMm = (mm: number): string => `${roundSmart(mm / lengthUnitFactorMm)} ${lengthUnitLabel}`;
  /** metre value shown in the door-height unit picked in the selector */
  const lenM = (m: number): string => `${roundSmart((m * 1000) / heightUnitFactorMm)} ${heightUnitLabel}`;

  // Air volume rows: always show m3/h, plus the unit selected in the tool.
  const airVolumeRows: [string, string][] = [
    ['Total Air Volume', `${selection.totalAirVolumeCmh} m3/h`],
    ['Total Air Volume', `${selection.totalAirVolumeCfm} CFM`],
  ];
  if (airflowUnit === 'ls') {
    const ls = Math.round((selection.totalAirVolumeCmh / 3.6) * 10) / 10;
    airVolumeRows.splice(1, 0, ['Total Air Volume', `${ls} ${airflowUnitLabel ?? 'l/s'}`]);
  }


  const doc = input.existingDoc ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  if (input.existingDoc) doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  const logo = companyLogoUrl ? await loadImage(companyLogoUrl) : null;
  const brandLogo = brandInfo?.logoUrl ? await loadImage(brandInfo.logoUrl) : null;
  const seriesPhoto = seriesInfo?.imageUrl ? await loadImage(seriesInfo.imageUrl) : null;

  // ---- Fan-datasheet style header / footer ----
  const drawHeader = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(0, 26, pageW, 26);

    if (logo) {
      const { w, h } = fit(logo, 40, 18);
      doc.addImage(logo.base64, fmt(logo.base64), 6, 4 + (18 - h) / 2, w, h, undefined, 'NONE');
    } else {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.text);
      doc.text(companyName || 'Air Curtain Selector', 21, 13, { align: 'center' });
    }

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text('Technical Datasheet', pageW / 2, 14, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    doc.text(
      `${selection.model.brand} | ${seriesInfo?.name ?? CATEGORY_LABELS[selection.model.category]}`,
      pageW / 2,
      20,
      { align: 'center' },
    );

    const badge = seriesPhoto ?? brandLogo;
    if (badge) {
      const { w, h } = fit(badge, 24, 24);
      doc.addImage(badge.base64, fmt(badge.base64), pageW - 4 - w, 1 + (24 - h) / 2, w, h, undefined, 'NONE');
    }
  };

  const hasCombination = selection.unitsRequired > 1;
  const TOTAL_PAGES = hasCombination ? 4 : 3;
  const drawFooter = (page: number) => {
    const footerY = pageH - 7;
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.25);
    doc.line(margin, footerY - 3, pageW - margin, footerY - 3);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    const items = [contactInfo?.phone ? `Tel: ${contactInfo.phone}` : null, contactInfo?.email].filter(Boolean);
    doc.text(items.join(' | ') || companyName || '', margin, footerY);
    doc.text(`Rev ${new Date().toISOString().split('T')[0]}`, pageW / 2, footerY, { align: 'center' });
    doc.text(`Page ${page}/${TOTAL_PAGES}`, pageW - margin, footerY, { align: 'right' });
  };

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Fan-style two-column spec section
  const drawSpecSection = (title: string, items: [string, string][], x: number, y: number, width: number) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text(title, x, y);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(x, y + 1.5, x + width, y + 1.5);

    let cy = y + 5.5;
    doc.setFontSize(7.5);
    items.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.textLight);
      doc.text(label, x, cy);
      doc.setTextColor(...COLORS.text);
      doc.text(value, x + width, cy, { align: 'right' });
      cy += 4;
    });
    return cy + 1;
  };

  // ===================== PAGE 1 — TECHNICAL DATA =====================
  drawHeader();
  let currentY = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text(`Model : ${selection.arrangement}`, margin, currentY);
  currentY += 6;

  // Product photo sits in the free space to the right of the description
  let photoBottom = currentY;
  let descWidth = pageW - margin * 2;
if (seriesPhoto) {
    const { w, h } = fit(seriesPhoto, 78, 46);
    const px = pageW - margin - w;
    const py = currentY - 4;
    doc.addImage(seriesPhoto.base64, fmt(seriesPhoto.base64), px, py, w, h, undefined, 'NONE');
    photoBottom = py + h + 2;
    descWidth = pageW - margin * 2 - w - 8;
  }

  if (seriesInfo?.datasheetDescription) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    const split = doc.splitTextToSize(seriesInfo.datasheetDescription, descWidth);
    doc.text(split, margin, currentY);
    currentY += split.length * 3 + 2;
  }

  currentY = Math.max(currentY, photoBottom);

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.4);
  doc.line(margin, currentY, pageW - margin, currentY);
  currentY += 4;

  const leftColX = 10;
  const leftColWidth = 68;
  const rightColX = 84;
  const rightColWidth = pageW - rightColX - 8;

  // LEFT COLUMN
  let leftY = currentY;
  leftY = drawSpecSection(
    'Selection Data',
    [
      ...(projectName ? ([['Project', projectName]] as [string, string][]) : []),
      ...(clientName ? ([['Client', clientName]] as [string, string][]) : []),
      ['Date', new Date().toLocaleDateString()],
      ['Door Width', lenMm(doorWidthMm)],
      ['Door Height', lenM(doorHeightM)],
      ['Required Floor Velocity', `${minFloorVelocity} m/s`],
      ['Selection Match', `${selection.matchPercent} %`],
    ],
    leftColX,
    leftY,
    leftColWidth,
  );
  leftY += 2;

  leftY = drawSpecSection(
    'Performance',
    [
      ['Total Units', String(selection.unitsRequired)],
      ['Installed Length', lenMm(selection.totalLengthMm)],
      ['Opening Coverage', `${Math.round(selection.coverage * 100)} %`],
      ['Nozzle Velocity', `${selection.outletVelocity} m/s`],
      ['Velocity at Floor', `${selection.floorVelocity.toFixed(2)} m/s`],
      ['Effective Throw', lenM(selection.effectiveThrowM)],
      ...airVolumeRows,
    ],
    leftColX,
    leftY,
    leftColWidth,
  );

  // RIGHT COLUMN
  let rightY = currentY;
  rightY = drawSpecSection(
    'Unit Data',
    [
      ['Brand', selection.model.brand],
      ['Series', seriesInfo?.name ?? '-'],
      ['Mounting', CATEGORY_LABELS[selection.model.category]],
      ['Motor Type', selection.model.motorType],
      ['Mounting Height Range', `${selection.model.mountingHeightMin != null ? roundSmart((selection.model.mountingHeightMin * 1000) / heightUnitFactorMm) : '-'} - ${selection.model.mountingHeightMax != null ? lenM(selection.model.mountingHeightMax) : '-'}`],
    ],
    rightColX,
    rightY,
    rightColWidth,
  );
  rightY += 2;

  rightY = drawSpecSection(
    'Electrical & Acoustic',
    [
      ['Voltage / Frequency', `${selection.voltage ?? '220-240V'} / ${selection.supplyFrequencyHz} Hz`],
      ...(selection.frequencyRatio !== 1
        ? [['Fan Law Correction', `from ${selection.ratedFrequencyHz} Hz (ratio ${selection.frequencyRatio})`] as [string, string]]
        : []),
      ['Total Input Power', `${selection.totalPowerW} W`],
      ['Sound Level @ 3 m', selection.noiseDb ? `${selection.noiseDb} dB(A)` : '-'],
      ['Total Net Weight', `${selection.totalWeightKg} kg`],
    ],
    rightColX,
    rightY,
    rightColWidth,
  );

  currentY = Math.max(leftY, rightY) + 4;


  // Unit schedule table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.text('Unit Schedule', margin, currentY);
  currentY += 2;

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    headStyles: { fillColor: COLORS.head, fontSize: 7.5, textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: COLORS.border, textColor: COLORS.text },
    head: [[`Model`, 'Qty', `Unit Length (${lengthUnitLabel})`, 'Motor', 'Mounting', 'Air Volume (each)', 'Power (each)', 'Noise @ 3 m (each)']],
    body: selection.units.map((u) => [
      u.model.model,
      String(u.qty),
      lenMm(u.model.lengthMm),
      u.model.motorType,
      CATEGORY_LABELS[u.model.category],
      `${u.model.airVolumeCmh ?? '-'} m3/h`,
      `${u.model.inputPowerW ?? '-'} W`,
      u.model.noiseDb ? `${u.model.noiseDb} dB(A)` : '-',
    ]),
    margin: { left: margin, right: margin },
  });

  // Octave band sound levels
  if (noiseMode === 'octave' && selection.octaveBands) {
    let ny = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.text);
    doc.text(
      selection.octaveBandsEstimated
        ? 'Sound Level — Octave Bands @ 3 m, dB (estimated from overall dB(A))'
        : 'Sound Level — Octave Bands @ 3 m, dB',
      margin,
      ny,
    );
    ny += 2;
    autoTable(doc, {
      startY: ny,
      theme: 'grid',
      headStyles: { fillColor: COLORS.head, fontSize: 7.5, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: COLORS.border, textColor: COLORS.text, halign: 'center' },
      head: [['Hz', ...selection.octaveBands.map((b) => b.label), 'Overall dB(A)']],
      body: [[
        'dB',
        ...selection.octaveBands.map((b) => b.value.toFixed(1)),
        selection.noiseDb ? `${selection.noiseDb}` : '-',
      ]],
      margin: { left: margin, right: margin },
    });
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(
    'Data as per catalogue; specifications subject to change without notice.',
    margin,
    pageH - 14,
    { maxWidth: pageW - margin * 2 },
  );
  drawFooter(1);

  // ===================== PAGE 2 — TECHNICAL DRAWING & DIMENSIONS =====================
  doc.addPage();
  drawHeader();
  let y = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text(`Model : ${selection.arrangement}`, margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.text('Technical Drawing', margin, y);
  y += 5;

  const drawingUrl =
    selection.model.drawingUrl ||
    selection.units.map((u) => u.model.drawingUrl).find(Boolean) ||
    seriesInfo?.drawingUrl ||
    null;

  const dimRows = dimensions.filter(
    (d) => !d.modelId || selection.units.some((u) => u.model.id === d.modelId),
  );
  // Present dimension columns in catalogue sequence: L, W, H first.
  const dimOrder = ['l', 'length', 'w', 'width', 'h', 'height'];
  const dimRank = (k: string) => {
    const i = dimOrder.indexOf(k.trim().toLowerCase());
    return i === -1 ? dimOrder.length : i;
  };
  const dimKeys = Array.from(new Set(dimRows.flatMap((d) => Object.keys(d.values)))).sort(
    (a, b) => dimRank(a) - dimRank(b),
  );

  const drawingHeight = 90;
  const drawingWidth = (pageW - 20) * 0.85;
  const drawingImg = drawingUrl ? await loadImage(drawingUrl) : null;
  if (drawingImg) {
    const { w, h } = fit(drawingImg, drawingWidth, drawingHeight);
    doc.addImage(drawingImg.base64, fmt(drawingImg.base64), (pageW - w) / 2, y, w, h, undefined, 'NONE');
  } else {
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.rect((pageW - drawingWidth) / 2, y, drawingWidth, drawingHeight);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textLight);
    doc.text('Technical drawing not available for this model', pageW / 2, y + drawingHeight / 2, { align: 'center' });
  }
  y += drawingHeight + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.text('Dimensions (mm)', margin, y);
  y += 2;

  if (dimRows.length && dimKeys.length) {
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      headStyles: { fillColor: COLORS.head, fontSize: 7.5, textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 1.3, lineColor: COLORS.border, textColor: COLORS.text },
      head: [['Reference', ...dimKeys]],
      body: dimRows.map((d) => [d.label, ...dimKeys.map((k) => String(d.values[k] ?? '-'))]),
      margin: { left: margin, right: margin },
    });
    y = lastY() + 4;
  } else {
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      headStyles: { fillColor: COLORS.head, fontSize: 7.5, textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 1.3, lineColor: COLORS.border, textColor: COLORS.text },
      head: [['Model', 'Length (mm)', 'Unit Size (L x W x H)', 'Carton Size', 'Net Weight', 'Gross Weight']],
      body: selection.units.map((u) => [
        u.model.model,
        String(u.model.lengthMm),
        u.model.unitSize ?? '-',
        u.model.cartonSize ?? '-',
        u.model.netWeightKg ? `${u.model.netWeightKg} kg` : '-',
        u.model.grossWeightKg ? `${u.model.grossWeightKg} kg` : '-',
      ]),
      margin: { left: margin, right: margin },
    });
    y = lastY() + 4;
  }

  drawFooter(2);

  // ===================== PAGE 3 — VELOCITY PROFILE =====================
  doc.addPage();
  drawHeader();
  y = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text(`Model : ${selection.arrangement}`, margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.text('Stream Range - Vertical air stream range (maximum installation height)', margin, y);
  y += 6;

  const targetV = minFloorVelocity;
  const lowV = selection.model.airVelocityLowMs;
  const nozzles: { label: string; v: number }[] = [];
  if (lowV && lowV > 0 && lowV !== selection.outletVelocity) nozzles.push({ label: '1 SPEED', v: lowV });
  nozzles.push({ label: nozzles.length ? '2 SPEED' : '1 SPEED', v: selection.outletVelocity });

  const slotM = slotWidthOf(selection.model);
  const seriesMaxM = selection.model.mountingHeightMax;
  const speeds = nozzles.map(({ label, v }) => {
    const t = effectiveThrow(v, slotM, targetV);
    let reachM = Math.max(0.5, t || doorHeightM);
    if (seriesMaxM && seriesMaxM > 0) reachM = Math.min(reachM, seriesMaxM);
    return { label, v, reachM, endV: jetVelocityAt(v, slotM, reachM) };
  });
  const dutyVel = jetVelocityAt(selection.outletVelocity, slotM, doorHeightM);

  const maxH = Math.max(doorHeightM, ...speeds.map((s) => s.reachM), 1);

  const w = (pageW - margin * 2) * 0.55;
  const x0 = margin + (pageW - margin * 2 - w) / 2 + 8;
  const h = 105;
  const yTop = y + 8;
  const yBot = yTop + h;
  const yAt = (m: number) => yTop + (Math.min(m, maxH) / maxH) * h;

  // frame + horizontal grid
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(x0, yTop, w, h);
doc.setLineWidth(0.2);
  // grid lines follow the y-axis tick step so they align with the values
  {
    const step = maxH <= 4 ? 0.5 : maxH <= 8 ? 1 : 2;
    for (let m = step; m < maxH - 1e-6; m += step) {
      const mm = Math.round(m * 10) / 10;
      const gy = yAt(mm);
      doc.line(x0, gy, x0 + w, gy);
    }
  }

  // duty point: requested installation height
  if (doorHeightM > 0 && doorHeightM < maxH) {
    const dy = yAt(doorHeightM);
    doc.setDrawColor(210, 50, 50);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([1.6, 1.1], 0);
    doc.line(x0, dy, x0 + w, dy);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(6.5);
    doc.setTextColor(210, 50, 50);
    doc.text(`duty point ${doorHeightM.toFixed(1)} m — ${dutyVel.toFixed(1)} m/s`, x0 + w - 1.5, dy - 1.2, { align: 'right' });
  }

  // left axis ticks: 0 → installation height
  {
    const step = maxH <= 4 ? 0.5 : maxH <= 8 ? 1 : 2;
    doc.setFontSize(6.5);
    doc.setTextColor(90, 90, 90);
    doc.setDrawColor(90, 90, 90);
    doc.setLineWidth(0.2);
    for (let m = 0; m <= maxH + 1e-6; m += step) {
      const mm = Math.round(m * 10) / 10;
      const ty = yAt(mm);
      doc.line(x0 - 1.6, ty, x0, ty);
      doc.text(mm.toFixed(1), x0 - 2.4, ty + 0.8, { align: 'right' });
    }
  }

  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text('installation height [m]', x0 - 11, yTop + h / 2, { angle: 90, align: 'center' });

const bandW = w / speeds.length;
  speeds.forEach((s, idx) => {
    const cx = x0 + bandW * idx + bandW / 2;
    const endY = yAt(s.reachM);
    const startY = yTop + 9;

    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(s.label, cx, yTop - 2, { align: 'center' });
    doc.text(`${s.v.toFixed(1)} m/s*`, cx, startY - 2, { align: 'center' });

    // Wavy strand x-position (mm) — gentle sway that grows downwards so the
    // strands leave the nozzle straight and never bend at the top.
    const strandX = (t: number, lane: number) => {
      const centreWave = Math.sin(t * Math.PI * 3.4) * 1.7 * t;
      const spread = 1.4 + t * 4.8;
      const ripple = Math.sin(t * Math.PI * 6.8 + lane * 0.9) * 0.25 * t;
      return cx + centreWave + lane * spread + ripple;
    };

    // Shaded air column (light air tone, fading towards the floor) — bounded
    // exactly by the two outer wave strands.
{
      const segs = 24;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const yA = startY + (endY - startY) * t0;
        const yB = startY + (endY - startY) * t1;
        const lA = strandX(t0, -1);
        const rA = strandX(t0, 1);
        const lB = strandX(t1, -1);
        const rB = strandX(t1, 1);
        const shade = 1 - 0.55 * ((t0 + t1) / 2);
        const r = Math.round(255 - 129 * shade);
        const g = Math.round(255 - 55 * shade);
        const b = Math.round(255 - 28 * shade);
        doc.setFillColor(r, g, b);
        doc.triangle(lA, yA, rA, yA, rB, yB, 'F');
        doc.triangle(lA, yA, lB, yB, rB, yB, 'F');
      }
    }

doc.setDrawColor(242, 163, 60);
    doc.setLineWidth(0.38);
    // Wavy strands diverging from the nozzle (straight at the top, gentle
    // sway increasing towards the floor).
    for (const lane of [-1, 0, 1]) {
      const steps = 48;
      let px = strandX(0, lane);
      let py = startY;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const nx = strandX(t, lane);
        const ny = startY + (endY - startY) * t;
        doc.line(px, py, nx, ny);
        px = nx;
        py = ny;
      }
// Dotted airflow pulse along the strand — mirrors the animated dashed
      // line on the website chart (soft light tone).
      doc.setDrawColor(250, 218, 177);
      doc.setLineWidth(0.22);
      doc.setLineDashPattern([0.7, 1.8], 0);
      px = strandX(0, lane);
      py = startY;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const nx = strandX(t, lane);
        const ny = startY + (endY - startY) * t;
        doc.line(px, py, nx, ny);
        px = nx;
        py = ny;
      }
      doc.setLineDashPattern([], 0);
      doc.setDrawColor(242, 163, 60);
      doc.setLineWidth(0.38);
    }

    doc.setFontSize(6.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`${s.endV.toFixed(1)} m/s*`, cx + 6, endY - 1.5);

    doc.setDrawColor(90, 90, 90);
    doc.setLineWidth(0.3);
    doc.line(x0 - 2, endY, x0, endY);
    doc.text(`${s.reachM.toFixed(1)} m`, x0 + 1.5, endY - 1.2, { align: 'left' });
  });

  doc.setFontSize(5.5);
  doc.setTextColor(110, 110, 110);
  doc.text('* - air stream speed [m/s]', x0, yBot + 5);

  y = yBot + 12;

  // Tabulated velocity data
  const profile = selection.velocityProfile;
  if (profile.length > 1) {
    const step = Math.max(1, Math.ceil(profile.length / 10));
    const sampled = profile.filter((_, i) => i % step === 0);
    // Always include the selected mounting height (e.g. 3 m) so the table
    // shows the air speed at the user's exact distance from the unit.
    const hasMount = sampled.some((p) => Math.abs(p.distance - doorHeightM) < 0.05);
    if (!hasMount && doorHeightM > 0) {
      const atMount = profile.find((p) => Math.abs(p.distance - doorHeightM) < 0.05)
        ?? { distance: doorHeightM, velocity: jetVelocityAt(selection.outletVelocity, slotWidthOf(selection.model), doorHeightM) };
      sampled.push(atMount);
      sampled.sort((a, b) => a.distance - b.distance);
    }
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      headStyles: { fillColor: COLORS.head, fontSize: 7.5, textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 1.3, lineColor: COLORS.border, textColor: COLORS.text, halign: 'center' },
      head: [['Distance from unit (m)', ...sampled.map((p) => p.distance.toFixed(1))]],
      body: [['Air speed (m/s)', ...sampled.map((p) => p.velocity.toFixed(2))]],
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
      margin: { left: margin, right: margin },
    });
  }


  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(
    'Velocity projection based on the plane-jet decay law V(x) = V0 x 2.4 x sqrt(b0 / x). Data as per catalogue; specifications subject to change.',
    margin,
    pageH - 14,
    { maxWidth: pageW - margin * 2 },
  );
  drawFooter(3);

  if (hasCombination) {
  // ===================== PAGE 4 - COMBINATION DOOR DIGITAL TWIN =====================
  doc.addPage();
  drawHeader();
  y = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text('Combination Air Curtain - Door Digital Twin', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(
    `${seriesInfo?.name ?? selection.model.brand} | ${CATEGORY_LABELS[selection.model.category]} | ${selection.arrangement}`,
    margin,
    y,
  );
  y += 6;

  const expandedUnits = selection.units.flatMap((unit) =>
    Array.from({ length: unit.qty }, () => unit.model),
  );
  const mountingMinimums = expandedUnits
    .map((model) => model.mountingHeightMin)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const mountingMaximums = expandedUnits
    .map((model) => model.mountingHeightMax)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const suitableHeightMin = mountingMinimums.length ? Math.max(...mountingMinimums) : null;
  const suitableHeightMax = mountingMaximums.length ? Math.min(...mountingMaximums) : null;
  const suitableHeightLabel = suitableHeightMin !== null && suitableHeightMax !== null
    ? `${lenM(suitableHeightMin)} - ${lenM(suitableHeightMax)}`
    : suitableHeightMax !== null
      ? `Up to ${lenM(suitableHeightMax)}`
      : 'Refer to model data';

  const modelSummary = selection.units
    .map(({ model, qty }) => `${qty} x ${model.model}`)
    .join(' + ');
  const unitSizeSummary = selection.units
    .map(({ model, qty }) => `${qty} x ${lenMm(model.lengthMm)}`)
    .join(' + ');
  const heightStatus = selection.heightSuitable ? 'SUITABLE' : 'CHECK';

  autoTable(doc, {
    startY: 44,
    tableWidth: 135,
    margin: { left: margin },
    theme: 'grid',
    styles: {
      fontSize: 7.2,
      cellPadding: 1.45,
      lineColor: COLORS.border,
      textColor: COLORS.text,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', fillColor: [245, 248, 252] },
      1: { cellWidth: 93 },
    },
    body: [
      ['Series / installation', `${seriesInfo?.name ?? selection.model.brand} / ${CATEGORY_LABELS[selection.model.category]}`],
      ['Exact selected model', modelSummary],
      ['Quantity / unit size', unitSizeSummary],
      ['Total installed width', lenMm(selection.totalLengthMm)],
      ['Selected door width', lenMm(doorWidthMm)],
      ['Selected door height', lenM(doorHeightM)],
      ['Suitable height range', `${suitableHeightLabel} / ${heightStatus}`],
      ['Outlet velocity', `${selection.outletVelocity.toFixed(2)} m/s`],
      ['Velocity at floor', `${selection.floorVelocity.toFixed(2)} m/s`],
    ],
  });

  if (seriesPhoto) {
    const size = fit(seriesPhoto, 40, 25);
    const photoX = pageW - margin - size.w;
    const photoY = 46;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.textLight);
    doc.text('ACTUAL SELECTED PRODUCT', photoX + size.w / 2, 43, { align: 'center' });
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.25);
    doc.rect(photoX - 2, photoY - 1, size.w + 4, size.h + 4);
    doc.addImage(seriesPhoto.base64, fmt(seriesPhoto.base64), photoX, photoY, size.w, size.h, undefined, 'NONE');
  }

  const selectionSummaryBottom = lastY();
  const doorX = 24;
  const doorY = Math.max(98, selectionSummaryBottom + 15);
  const doorW = pageW - 48;
  const doorH = 205 - doorY;
  const installedW = doorW * Math.min(1, selection.totalLengthMm / Math.max(doorWidthMm, 1));
  const unitStartX = doorX + (doorW - installedW) / 2;
  const unitY = doorY - 12;
  const unitH = selection.model.category === 'recessed' ? 3.5 : 12;

  // Door frame
  doc.setFillColor(246, 249, 252);
  doc.rect(doorX, doorY, doorW, doorH, 'F');
  doc.setDrawColor(80, 95, 115);
  doc.setLineWidth(1.2);
  doc.line(doorX, doorY, doorX, doorY + doorH);
  doc.line(doorX + doorW, doorY, doorX + doorW, doorY + doorH);

  if (selection.model.category === 'recessed') {
    doc.setFillColor(255, 255, 255);
    doc.rect(doorX - 5, unitY - 8, doorW + 10, 8, 'F');
    doc.setDrawColor(185, 190, 198);
    doc.line(doorX - 5, unitY, doorX + doorW + 5, unitY);
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.textLight);
    doc.text('CEILING - UNITS CONCEALED ABOVE / DISCHARGE GRILLES FLUSH', pageW / 2, unitY - 2.5, { align: 'center' });
  }

  const jetColours: [number, number, number][] = [
    [52, 211, 235],
    [80, 145, 235],
    [145, 105, 225],
    [45, 185, 145],
  ];

  let unitX = unitStartX;
  expandedUnits.forEach((model, index) => {
    const uw = installedW * model.lengthMm / Math.max(selection.totalLengthMm, 1);
    const colour = jetColours[index % jetColours.length];

    if (selection.model.category === 'recessed') {
      doc.setFillColor(225, 229, 234);
      doc.rect(unitX, unitY, uw, unitH, 'F');
      doc.setDrawColor(80, 88, 98);
      doc.setLineWidth(0.35);
      doc.rect(unitX, unitY, uw, unitH);
      doc.line(unitX + 1, unitY + unitH / 2, unitX + uw - 1, unitY + unitH / 2);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(unitX, unitY, uw, unitH, 1.5, 1.5, 'F');
      doc.setDrawColor(190, 196, 204);
      doc.setLineWidth(0.35);
      doc.rect(unitX, unitY, uw, unitH);
      doc.setFillColor(232, 236, 240);
      doc.roundedRect(unitX + 2, unitY + 2, Math.max(2, uw - 4), 2, 0.5, 0.5, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.min(6.5, Math.max(4.2, uw / 6)));
    doc.setTextColor(...COLORS.text);
    doc.text(model.model, unitX + uw / 2, unitY + unitH + 4, { align: 'center', maxWidth: Math.max(8, uw - 1) });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.text(`${model.lengthMm} mm`, unitX + uw / 2, unitY + unitH + 7, { align: 'center' });

    // Straight, proportional airflow column with a light fade toward the floor.
    const jetTop = doorY;
    const jetHeight = doorH - 3;
    const bands = 24;
    for (let band = 0; band < bands; band += 1) {
      const t = band / bands;
      const blend = 0.28 + t * 0.62;
      const r = Math.round(colour[0] + (255 - colour[0]) * blend);
      const g = Math.round(colour[1] + (255 - colour[1]) * blend);
      const b = Math.round(colour[2] + (255 - colour[2]) * blend);
      doc.setFillColor(r, g, b);
      doc.rect(unitX, jetTop + jetHeight * t, uw, jetHeight / bands + 0.2, 'F');
    }

    // A PDF is static, so repeated wave paths and arrows represent the live
    // downward animation used on the website.
    doc.setDrawColor(Math.max(0, colour[0] - 35), Math.max(0, colour[1] - 35), Math.max(0, colour[2] - 35));
    doc.setLineWidth(0.35);
    const waveCount = Math.max(2, Math.min(4, Math.round(uw / 18)));
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
      const waveX = unitX + uw * (waveIndex + 1) / (waveCount + 1);
      let previousX = waveX;
      let previousY = jetTop + 5;
      for (let step = 1; step <= 18; step += 1) {
        const waveY = jetTop + 5 + (jetHeight - 14) * step / 18;
        const nextX = waveX + Math.sin(step * 0.9 + index) * Math.min(1.7, uw * 0.025);
        doc.line(previousX, previousY, nextX, waveY);
        previousX = nextX;
        previousY = waveY;
      }
      doc.line(previousX, previousY, previousX - 1.1, previousY - 2.1);
      doc.line(previousX, previousY, previousX + 1.1, previousY - 2.1);
    }

    if (index < expandedUnits.length - 1) {
      doc.setFillColor(235, 245, 250);
      doc.rect(unitX + uw - 0.8, doorY, 1.6, doorH - 3, 'F');
    }

    unitX += uw;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.text);
  doc.text(
    `Door ${lenMm(doorWidthMm)} W x ${lenM(doorHeightM)} H | Actual models shown proportionally`,
    pageW / 2,
    doorY + doorH + 7,
    { align: 'center' },
  );

  autoTable(doc, {
    startY: doorY + doorH + 12,
    theme: 'grid',
    headStyles: { fillColor: COLORS.head, fontSize: 6.2, textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 6.2, cellPadding: 1.3, lineColor: COLORS.border, textColor: COLORS.text },
    head: [['Exact model arrangement', 'Installed', 'Coverage', 'Door height', 'Suitable range', 'Outlet velocity', 'Floor velocity', 'Status']],
    body: [[
      selection.arrangement,
      lenMm(selection.totalLengthMm),
      `${Math.round(selection.coverage * 100)}%`,
      lenM(doorHeightM),
      suitableHeightLabel,
      `${selection.outletVelocity.toFixed(2)} m/s`,
      `${selection.floorVelocity.toFixed(2)} m/s`,
      selection.heightSuitable ? 'Suitable' : 'Check',
    ]],
    margin: { left: margin, right: margin },
  });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(
    'Static PDF airflow representation; live airflow animation is available on the website. Models and unit widths are shown proportionally to the selected door opening.',
    margin,
    pageH - 14,
    { maxWidth: pageW - margin * 2 },
  );
  drawFooter(4);
  }

  return doc;
}

export async function downloadAirCurtainDatasheet(input: AirCurtainDatasheetInput) {
  const doc = await generateAirCurtainDatasheet(input);
  const name = `${input.selection.model.brand}-${input.selection.model.model}-air-curtain-datasheet.pdf`.replace(
    /\s+/g,
    '_',
  );
  doc.save(name);
}
