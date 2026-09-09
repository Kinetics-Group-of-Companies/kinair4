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

export interface ChatScheduleFanRow {
  tag: string;
  quantity: number;
  duty: string;
  selection: FanSelection;
  airflowUnit?: string;
  pressureUnit?: string;
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
  widthUnit?: 'mm' | 'cm' | 'm' | 'in';
  heightUnit?: 'mm' | 'cm' | 'm' | 'in';
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
  airCurtainRows?: ChatScheduleAirCurtainRow[];
  airCurtainContext?: ChatScheduleAirCurtainContext;
}

const BLUE: [number, number, number] = [16, 106, 237];
const TEXT: [number, number, number] = [35, 43, 56];
const MUTED: [number, number, number] = [100, 116, 139];

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

export async function downloadCombinedScheduleDatasheet({
  title,
  rows,
  database,
  dimensionsMap,
  companyName,
  logoUrl,
  airCurtainRows = [],
  airCurtainContext,
}: ChatScheduleDatasheetOptions): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const brandName = companyName || database.companyName || 'KINAIR';
  const logo = await loadImage(logoUrl || database.logoUrl);

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

  doc.addPage();
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageW, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FAN SCHEDULE', 15, 16);
  autoTable(doc, {
    startY: 33,
    head: [['#', 'Tag', 'Duty', 'Selected model', 'Qty']],
    body: [
      ...rows.map((row, index) => [
        String(index + 1),
        row.tag,
        row.duty,
        row.selection.nomenclature,
        String(row.quantity),
      ]),
      ...airCurtainRows.map((row, index) => [
        String(rows.length + index + 1),
        row.tag,
        row.duty,
        row.label,
        String(row.quantity),
      ]),
    ],
    theme: 'grid',
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: TEXT },
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: 50 },
      2: { cellWidth: 43 },
      3: { cellWidth: 62 },
      4: { cellWidth: 12, halign: 'center' },
    },
    margin: { left: 15, right: 15 },
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    await generateDatasheetForSelection(
      row.selection,
      database,
      { airflowUnit: row.airflowUnit, pressureUnit: row.pressureUnit },
      dimensionsMap,
      { existingDoc: doc, skipSave: true, pageLabel: `Fan ${index + 1} of ${rows.length}` },
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
    const lengthFactors = { mm: 1, cm: 10, m: 1000, in: 25.4 } as const;
    const lengthLabels = { mm: 'mm', cm: 'cm', m: 'm', in: 'inch' } as const;
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
    });
  }

  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Fan_Schedule';
  doc.save(`${safeTitle}_Combined_Datasheets.pdf`);
}