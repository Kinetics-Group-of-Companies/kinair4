import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FanDatabase, FanSelection } from './fanData';
import type { AirCurtainSelection } from './airCurtainData';
import { rewriteStorageUrls } from './offline/fileCache';

/**
 * Add-on layer: light single-purpose PDFs (drawing only / noise data only)
 * for the AI chat. The main datasheet generator and the selection engine
 * are untouched.
 */

async function loadImage(url?: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(rewriteStorageUrls(url));
    const blob = await res.blob();
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!data) return null;
    const size = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, ...size };
  } catch {
    return null;
  }
}

function header(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 10, 10);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 10, 16);
  doc.setTextColor(30, 30, 30);
}

function placeImage(doc: jsPDF, img: { data: string; w: number; h: number }, y: number) {
  const maxW = 190;
  const maxH = 220;
  const ratio = Math.min(maxW / img.w, maxH / img.h);
  const w = img.w * ratio;
  const h = img.h * ratio;
  const format = img.data.includes('image/png') ? 'PNG' : 'JPEG';
  doc.addImage(img.data, format, (210 - w) / 2, y, w, h);
  return y + h;
}

const DIM_LABELS: [string, string][] = [
  ['phiD2', 'ØD2'],
  ['phiD1', 'ØD1'],
  ['phiD', 'ØD'],
  ['H', 'H'],
  ['E', 'E'],
  ['F', 'F'],
  ['L', 'L'],
  ['K', 'K'],
  ['nPhiD', 'n-ØD'],
  ['zPhiD1', 'z-ØD1'],
];

export async function downloadFanDrawing(
  selection: FanSelection,
  database: FanDatabase,
  dimensionsMap?: Map<string, any>,
): Promise<void> {
  const series: any = (database.series || []).find(
    (s: any) => s.id === selection.seriesId || s.name === selection.series,
  );
  const img = await loadImage(series?.drawingUrl);
  const doc = new jsPDF('p', 'mm', 'a4');
  header(doc, `${selection.nomenclature} — Dimensional Drawing`, `${series?.name ?? selection.series} · Ø${selection.diameter} mm`);

  let y = 28;
  if (img) {
    y = placeImage(doc, img, y) + 6;
  } else {
    doc.setFontSize(10);
    doc.text('No dimensional drawing is uploaded for this series.', 10, y);
    y += 8;
  }

  const dim = dimensionsMap?.get(`${selection.seriesId}-${selection.diameter}`);
  if (dim) {
    const rows = DIM_LABELS.map(([k, label]) => [label, dim[k] ? String(dim[k]) : '—']).filter(
      (r) => r[1] !== '—',
    );
    if (rows.length) {
      autoTable(doc, {
        startY: y,
        head: [['Dimension', 'Value (mm)']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: 10, right: 10 },
      });
    }
  }

  doc.save(`${selection.nomenclature}-drawing.pdf`);
}

const BANDS: [string, string][] = [
  ['hz63', '63 Hz'],
  ['hz125', '125 Hz'],
  ['hz250', '250 Hz'],
  ['hz500', '500 Hz'],
  ['hz1k', '1 kHz'],
  ['hz2k', '2 kHz'],
  ['hz4k', '4 kHz'],
  ['hz8k', '8 kHz'],
];

export async function downloadFanNoiseData(selection: FanSelection): Promise<void> {
  const noise: any = selection.noiseData || {};
  const doc = new jsPDF('p', 'mm', 'a4');
  header(
    doc,
    `${selection.nomenclature} — Sound Data`,
    `${Math.round(selection.operatingPoint.airflow).toLocaleString()} m³/h @ ${Math.round(
      selection.operatingPoint.staticPressure,
    )} Pa`,
  );

  const body = BANDS.map(([k, label]) => [label, noise[k] != null ? `${Math.round(noise[k])}` : '—']);
  autoTable(doc, {
    startY: 28,
    head: [['Octave band', 'Sound power Lw (dB)']],
    body,
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 10, right: 10 },
  });

  const endY = (doc as any).lastAutoTable?.finalY ?? 100;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Overall sound power: ${noise.overall ? `${Math.round(noise.overall)} dB(A)` : 'not available'}`,
    10,
    endY + 10,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    'Sound power levels at the fan. Sound pressure at a distance depends on directivity and room absorption.',
    10,
    endY + 17,
  );

  doc.save(`${selection.nomenclature}-sound-data.pdf`);
}

export async function downloadAirCurtainDrawing(selection: AirCurtainSelection): Promise<void> {
  const img = await loadImage(selection.model.drawingUrl);
  const doc = new jsPDF('p', 'mm', 'a4');
  header(doc, `${selection.model.model} — Dimensional Drawing`, selection.arrangement);

  let y = 28;
  if (img) {
    y = placeImage(doc, img, y) + 6;
  } else {
    doc.setFontSize(10);
    doc.text('No dimensional drawing is uploaded for this model.', 10, y);
    y += 8;
  }

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Value']],
    body: selection.units.map((u) => [`${u.qty} × ${u.model.model}`, `${u.model.lengthMm} mm long`]),
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`${selection.model.model}-drawing.pdf`);
}

export async function downloadAirCurtainNoiseData(selection: AirCurtainSelection): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  header(doc, `${selection.model.model} — Sound Data`, selection.arrangement);

  const bands = selection.octaveBands;
  const body = bands
    ? bands.map((b) => [b.label, `${Math.round(b.value)}`])
    : BANDS.map(([k, label]) => {
        const map: Record<string, number | null> = {
          hz63: selection.model.noise63,
          hz125: selection.model.noise125,
          hz250: selection.model.noise250,
          hz500: selection.model.noise500,
          hz1k: selection.model.noise1k,
          hz2k: selection.model.noise2k,
          hz4k: selection.model.noise4k,
          hz8k: selection.model.noise8k,
        };
        const v = map[k];
        return [label, v != null ? `${Math.round(v)}` : '—'];
      });

  autoTable(doc, {
    startY: 28,
    head: [['Octave band', 'Sound level dB @ 3 m']],
    body,
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 10, right: 10 },
  });

  const endY = (doc as any).lastAutoTable?.finalY ?? 100;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Overall: ${selection.noiseDb ? `${Math.round(selection.noiseDb)} dB(A) @ 3 m` : 'not available'}`,
    10,
    endY + 10,
  );
  if (selection.octaveBandsEstimated) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Octave spectrum estimated from the overall dB(A) level.', 10, endY + 17);
  }

  doc.save(`${selection.model.model}-sound-data.pdf`);
}
