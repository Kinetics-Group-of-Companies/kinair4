// Runtime-safe wrapper around the existing fan PDF generator.
// It also redraws the optional multi-fan Page 3 curve with the SAME catalogue
// point transformation, monotone smoothing, axis headroom and system-curve
// intersection rules used by the normal performance curve.

export * from './pdfDatasheetGenerator';

import { generateEnhancedDatasheet as generateEnhancedDatasheetOriginal } from './pdfDatasheetGenerator';
import { AIRFLOW_UNITS, PRESSURE_UNITS } from './fanData';

type DatasheetOptions = Parameters<typeof generateEnhancedDatasheetOriginal>[0];
type XY = { x: number; y: number };
type CurvePoint = { airflow: number; pressure: number };

function smoothMonotonePoints(points: XY[], samplesPerSegment = 12): XY[] {
  if (points.length < 3) return points;
  const n = points.length;
  const slopes = Array.from({ length: n - 1 }, (_, i) => {
    const dx = points[i + 1].x - points[i].x;
    return dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx;
  });
  const tangents = new Array<number>(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const magnitude = Math.hypot(a, b);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[i] = scale * a * slopes[i];
      tangents[i + 1] = scale * b * slopes[i];
    }
  }
  const output: XY[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    for (let step = 0; step < samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      output.push({
        x: p0.x + dx * t,
        y: (2 * t3 - 3 * t2 + 1) * p0.y +
          (t3 - 2 * t2 + t) * dx * tangents[i] +
          (-2 * t3 + 3 * t2) * p1.y +
          (t3 - t2) * dx * tangents[i + 1],
      });
    }
  }
  output.push(points[n - 1]);
  return output;
}

function findIntersection(curve: CurvePoint[], k: number): CurvePoint | null {
  if (curve.length < 2 || !Number.isFinite(k) || k <= 0) return null;
  const sorted = [...curve].sort((a, b) => a.airflow - b.airflow);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const residual = (p: CurvePoint) => p.pressure - k * p.airflow * p.airflow;
    if (residual(a) * residual(b) > 0) continue;
    let lo = a.airflow;
    let hi = b.airflow;
    const pressureAt = (q: number) => {
      const t = b.airflow === a.airflow ? 0 : (q - a.airflow) / (b.airflow - a.airflow);
      return a.pressure + t * (b.pressure - a.pressure);
    };
    for (let n = 0; n < 50; n++) {
      const mid = (lo + hi) / 2;
      const rLo = pressureAt(lo) - k * lo * lo;
      const rMid = pressureAt(mid) - k * mid * mid;
      if (rLo * rMid <= 0) hi = mid; else lo = mid;
    }
    const airflow = (lo + hi) / 2;
    return { airflow, pressure: pressureAt(airflow) };
  }
  return null;
}

function niceTicks(max: number, targetCount: number): number[] {
  if (!(max > 0)) return [0];
  const roughStep = max / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const step = residual <= 1.5 ? magnitude : residual <= 3 ? 2 * magnitude : residual <= 7 ? 5 * magnitude : 10 * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value <= max * 1.001; value += step) ticks.push(value);
  return ticks;
}

function redrawMultiFanCurve(doc: any, options: DatasheetOptions) {
  const quantity = options.multiFanQuantity || 1;
  const arrangement = options.multiFanArrangement || 'parallel';
  if (quantity <= 1) return;

  const isParallel = arrangement === 'parallel';
  const airflowFactor = AIRFLOW_UNITS[options.airflowUnit].factor;
  const pressureFactor = PRESSURE_UNITS[options.pressureUnit].factor;
  const valid = options.performanceData
    .filter(p => p && Number.isFinite(p.airflow) && Number.isFinite(p.staticPressure) && p.airflow >= 0 && p.staticPressure >= 0 && !(p.airflow === 0 && p.staticPressure === 0))
    .sort((a, b) => a.airflow - b.airflow);
  if (valid.length < 2) return;

  // Exact identical-fan transformation of the same catalogue points used by Page 1.
  const single: CurvePoint[] = valid.map(p => ({ airflow: p.airflow, pressure: p.staticPressure }));
  const combined: CurvePoint[] = single.map(p => ({
    airflow: p.airflow * (isParallel ? quantity : 1),
    pressure: p.pressure * (isParallel ? 1 : quantity),
  }));

  const op = options.selection.operatingPoint;
  const systemK = op.airflow > 0 ? op.staticPressure / (op.airflow * op.airflow) : 0;
  const intersection = findIntersection(combined, systemK) || {
    airflow: op.airflow * (isParallel ? quantity : 1),
    pressure: op.staticPressure * (isParallel ? 1 : quantity),
  };

  const singleDisplay = single.map(p => ({ x: p.airflow * airflowFactor, y: p.pressure * pressureFactor }));
  const combinedDisplay = combined.map(p => ({ x: p.airflow * airflowFactor, y: p.pressure * pressureFactor }));
  const duty = { x: intersection.airflow * airflowFactor, y: intersection.pressure * pressureFactor };
  const kDisplay = duty.x > 0 ? duty.y / (duty.x * duty.x) : 0;

  // Cover only the legacy Page-3 plot. Keep header, fan arrangement graphic and table intact.
  doc.setPage(doc.getNumberOfPages());
  doc.setFillColor(255, 255, 255);
  doc.rect(8, 96, 194, 86, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('System effect on performance curve', 10, 101);

  // Same geometry/axis policy as drawPerformanceCurve on Page 1.
  const x = 10, y = 104, width = 190, height = 74;
  const margin = { top: 2, right: 12, bottom: 16, left: 14 };
  const chartX = x + margin.left;
  const chartY = y + margin.top;
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const rawXMax = Math.max(...singleDisplay.map(p => p.x), ...combinedDisplay.map(p => p.x));
  const rawYMax = Math.max(...singleDisplay.map(p => p.y), ...combinedDisplay.map(p => p.y));
  const xMax = Math.max(1, rawXMax) * 1.10;
  const yMax = Math.max(1, rawYMax) * 1.10;
  const xTicks = niceTicks(xMax, 8);
  const yTicks = niceTicks(yMax, 6);
  const map = (p: XY) => ({
    x: chartX + (p.x / xMax) * chartW,
    y: chartY + chartH - (p.y / yMax) * chartH,
  });

  doc.setFillColor(255, 255, 255);
  doc.rect(chartX, chartY, chartW, chartH, 'F');
  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.2, 1.2], 0);
  for (const tick of yTicks) if (tick > 0) {
    const py = chartY + chartH - (tick / yMax) * chartH;
    doc.line(chartX, py, chartX + chartW, py);
  }
  for (const tick of xTicks) if (tick > 0) {
    const px = chartX + (tick / xMax) * chartW;
    doc.line(px, chartY, px, chartY + chartH);
  }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.4);
  doc.line(chartX, chartY + chartH, chartX + chartW + 2, chartY + chartH);
  doc.line(chartX, chartY - 2, chartX, chartY + chartH);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  for (const tick of xTicks) {
    const px = chartX + (tick / xMax) * chartW;
    doc.text(tick >= 100 ? Math.round(tick).toString() : tick.toFixed(tick < 10 ? 2 : 1), px, chartY + chartH + 4.5, { align: 'center' });
  }
  for (const tick of yTicks) {
    const py = chartY + chartH - (tick / yMax) * chartH;
    doc.text(tick >= 100 ? Math.round(tick).toString() : tick.toFixed(tick < 10 ? 1 : 0), chartX - 2.5, py + 0.8, { align: 'right' });
  }
  doc.setFontSize(8);
  doc.text(`Static pressure (${PRESSURE_UNITS[options.pressureUnit].label})`, chartX - 11, chartY + chartH / 2, { angle: 90, align: 'center' });
  doc.text(`Airflow (${AIRFLOW_UNITS[options.airflowUnit].label})`, chartX + chartW / 2, chartY + chartH + 10, { align: 'center' });

  // Single-fan reference: same smoothed Page-1 curve, dashed grey.
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([3, 2], 0);
  const smoothSingle = smoothMonotonePoints(singleDisplay.map(map));
  for (let i = 1; i < smoothSingle.length; i++) doc.line(smoothSingle[i - 1].x, smoothSingle[i - 1].y, smoothSingle[i].x, smoothSingle[i].y);
  doc.setLineDashPattern([], 0);

  // Combined curve: same monotone engine, only Q or P is transformed.
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.7);
  const smoothCombined = smoothMonotonePoints(combinedDisplay.map(map));
  for (let i = 1; i < smoothCombined.length; i++) doc.line(smoothCombined[i - 1].x, smoothCombined[i - 1].y, smoothCombined[i].x, smoothCombined[i].y);

  // Fixed system resistance P=kQ² through the recalculated combined operating point.
  doc.setDrawColor(200, 30, 30);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([1.5, 1.5], 0);
  let previous: XY | null = null;
  const maxSystemQ = Math.min(duty.x * 1.2, xMax);
  for (let i = 0; i <= 40; i++) {
    const q = maxSystemQ * i / 40;
    const p = kDisplay * q * q;
    const current = map({ x: q, y: p });
    if (previous && current.y >= chartY && previous.y >= chartY) doc.line(previous.x, previous.y, current.x, current.y);
    previous = current;
  }
  doc.setLineDashPattern([], 0);

  // Recalculated duty point sits on both combined fan curve and system curve.
  const dp = map(duty);
  doc.setDrawColor(240, 120, 20);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(chartX, dp.y, dp.x, dp.y);
  doc.line(dp.x, chartY + chartH, dp.x, dp.y);
  doc.setLineDashPattern([], 0);
  doc.setFillColor(217, 38, 38);
  doc.setDrawColor(255, 255, 255);
  doc.circle(dp.x, dp.y, 1.8, 'FD');

  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Dashed grey: single fan', chartX + 2, chartY + 4);
  doc.setTextColor(0, 0, 0);
  doc.text(`Black: ${quantity}-fan ${arrangement}`, chartX + 45, chartY + 4);
  doc.setTextColor(200, 30, 30);
  doc.text('Red dashed: system curve', chartX + 92, chartY + 4);
}

export async function generateEnhancedDatasheet(options: DatasheetOptions) {
  const seriesInfo = options.database.series.find(s => s.id === options.selection.seriesId) ||
    options.database.series.find(s => s.name === options.selection.series);

  (globalThis as typeof globalThis & { selectedProductUrl?: string | null }).selectedProductUrl =
    seriesInfo?.imageUrl || options.seriesImageUrl || null;

  try {
    // Prevent the legacy generator from saving before Page 3 is corrected.
    const doc = await generateEnhancedDatasheetOriginal({ ...options, skipSave: true });
    if ((options.multiFanQuantity || 1) > 1) redrawMultiFanCurve(doc, options);
    if (!options.skipSave) doc.save(`${options.selection.nomenclature}-datasheet.pdf`);
    return doc;
  } finally {
    delete (globalThis as typeof globalThis & { selectedProductUrl?: string | null }).selectedProductUrl;
  }
}
