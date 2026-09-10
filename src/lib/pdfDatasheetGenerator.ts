import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { FanSelection, FanDatabase, AIRFLOW_UNITS, PRESSURE_UNITS, FanPerformancePoint, FanDimension, AccessoryType, ACCESSORY_DESCRIPTIONS, FireClass, calculateTotalEfficiency } from './fanData';
import fanTechnicalDrawing from '@/assets/fan-technical-drawing-3.png';
import { fetchDatasheetConfig, DatasheetConfig } from '@/hooks/useDatasheetConfig';
import { supabase } from '@/integrations/backend/client';
import { formatPower } from './utils';
import { rewriteStorageUrls } from './offline/fileCache';

// Flexible dimension types for dynamic dimensions
export interface FlexibleDimensionParam {
  param_key: string;
  param_label: string;
  param_type: 'number' | 'text';
  display_order: number;
}

export interface FlexibleDimensionValue {
  size: number;
  values: Record<string, string | number>;
}

export interface DatasheetOptions {
  selection: FanSelection;
  database: FanDatabase;
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  fanSizeUnit?: 'mm' | 'in';
  performanceData: FanPerformancePoint[];
  fanRPM: number;
  multiFanQuantity?: number;
  multiFanArrangement?: 'parallel' | 'series';
  outletVelocity: number;
  dynamicPressure: number;
  totalPressure: number;
  casingWeight: number;
  impellerWeight: number;
  motorWeight: number;
  seriesImageUrl?: string;
  seriesDrawingUrl?: string;
  fanDimensions?: FanDimension;
  // Flexible dimensions support
  flexibleDimensionSchema?: FlexibleDimensionParam[];
  flexibleDimensionValue?: FlexibleDimensionValue;
  motorSpec?: {
    brandName?: string;
    motorFrame?: string;
    ratedCurrent?: number;
    fullLoadCurrent?: number;
    startingCurrent?: number;
    voltage?: number;
    frequency?: number;
    ipRating?: string;
    insulationClass?: string;
    efficiencyClass?: string;
    motorWeight?: number;
    fireRating?: string;
  };
  airDensity?: number;
  temperature?: number;
  altitude?: number;
  noiseDistance?: number; // Distance in meters for noise calculation
  noiseDirectivityQ?: number; // Sound directivity factor Q (1=free field, 2=half-sphere, 4=quarter, 8=corner)
  showOctaveBands?: boolean; // Whether to show octave band data on datasheet
  amcaCertified?: boolean; // Whether to show AMCA certification
  fireRating?: string; // Fire rating (e.g., F400, F300)
  amcaLogoUrl?: string; // Custom AMCA logo URL
  fireRatingLogoUrl?: string; // Custom fire rating logo URL
  datasheetDescription?: string; // Custom description for the series datasheet
  datasheetConfig?: DatasheetConfig; // Full datasheet configuration from admin
  chartImage?: string; // Base64 image of the captured pressure chart from webpage
  powerChartImage?: string; // Base64 image of the captured power chart from webpage
  efficiencyChartImage?: string; // Base64 image of the captured efficiency chart from webpage
  // Speed control settings
  vfdEnabled?: boolean; // Whether VFD is enabled (3-phase)
  vfdFrequency?: number; // VFD frequency in Hz
  voltageDriveEnabled?: boolean; // Whether voltage drive is enabled (1-phase)
  driveVoltage?: number; // Drive voltage in V
  nominalVoltage?: number; // Nominal voltage for voltage drive
  motorPhase?: number; // Motor phase (1 or 3)
  // Adjusted noise data after speed control
  adjustedNoiseData?: {
    hz63?: number;
    hz125?: number;
    hz250?: number;
    hz500?: number;
    hz1k?: number;
    hz2k?: number;
    hz4k?: number;
    hz8k?: number;
    overall?: number;
  };
  // Family curve display
  showFamilyCurve?: boolean; // Whether family curves are shown
  familyCurveData?: { angle: number; data: { airflow: number; staticPressure: number; shaftPower: number; efficiency: number }[] }[]; // All blade angle data
  // New datasheet features
  iomUrl?: string; // IOM manual URL for QR code
  soundOutletReduction?: number; // dB reduction from source to outlet
  stallAirflowMinPercent?: number; // Min safe operating airflow %
  stallAirflowMaxPercent?: number; // Max safe operating airflow %
  compatibleAccessories?: string[]; // Array of accessory codes
  // Base curve data for VFD/voltage drive comparison
  baseCurveData?: {
    label: string;
    performanceData: { airflow: number; staticPressure: number; shaftPower: number; efficiency: number }[];
    operatingPoint?: { airflow: number; staticPressure: number; shaftPower: number; efficiency: number };
  };
  // Project mode options
  existingDoc?: jsPDF; // If provided, append pages to this document instead of creating new one
  skipSave?: boolean; // If true, don't save the PDF (useful for project mode)
  pageLabel?: string; // Optional label like "Fan 1 of 5" for project mode
}

// Generate QR code as base64 data URL
async function generateQRCode(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      width: 100,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch {
    return null;
  }
}

// Load image as base64 with dimensions
async function loadImageAsBase64(url: string): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const response = await fetch(rewriteStorageUrls(url));
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Create an image to get dimensions
        const img = new Image();
        img.onload = () => {
          resolve({ base64, width: img.width, height: img.height });
        };
        img.onerror = () => resolve({ base64, width: 1, height: 1 });
        img.src = base64;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Calculate noise at distance with directivity factor Q
// Q=1: Free field (spherical), Q=2: Half-sphere (floor), Q=4: Quarter (corner), Q=8: Eighth (3 surfaces)
// Formula: Lp = Lw - 10*log10(4πr²/Q) = Lw - 20*log10(r) - 11 + 10*log10(Q)
// This formula matches the webpage calculation exactly
function calculateNoiseAtDistance(sourceNoise: number, distance: number, directivityQ: number = 2): number {
  if (distance <= 0) return sourceNoise; // At source
  // Use Math.max to clamp minimum distance to 0.1 (matches webpage formula)
  const effectiveDistance = Math.max(distance, 0.1);
  const reduction = 20 * Math.log10(effectiveDistance) + 11 - 10 * Math.log10(directivityQ);
  return Math.round((sourceNoise - reduction) * 10) / 10;
}

// Calculate NC (Noise Criteria) level from octave band data
function calculateNCLevel(noiseData: { hz63?: number; hz125?: number; hz250?: number; hz500?: number; hz1k?: number; hz2k?: number; hz4k?: number; hz8k?: number; overall?: number }): { level: number; description: string } {
  // NC curves reference values for each octave band (NC 15 to NC 85)
  const ncCurves: { [key: number]: number[] } = {
    15: [47, 36, 29, 22, 17, 14, 12, 11],
    20: [51, 40, 33, 26, 22, 19, 17, 16],
    25: [54, 44, 37, 31, 27, 24, 22, 21],
    30: [57, 48, 41, 35, 31, 29, 28, 27],
    35: [60, 52, 45, 40, 36, 34, 33, 32],
    40: [64, 56, 50, 45, 41, 39, 38, 37],
    45: [67, 60, 54, 49, 46, 44, 43, 42],
    50: [71, 64, 58, 54, 51, 49, 48, 47],
    55: [74, 67, 62, 58, 56, 54, 53, 52],
    60: [77, 71, 67, 63, 61, 59, 58, 57],
    65: [80, 75, 71, 68, 66, 64, 63, 62],
    70: [83, 79, 75, 72, 71, 70, 69, 68],
    75: [86, 83, 79, 77, 76, 75, 74, 73],
    80: [89, 87, 83, 82, 81, 80, 79, 78],
    85: [92, 91, 87, 87, 86, 85, 84, 83],
  };
  
  const octaveBands = [
    noiseData.hz63 || 0,
    noiseData.hz125 || 0,
    noiseData.hz250 || 0,
    noiseData.hz500 || 0,
    noiseData.hz1k || 0,
    noiseData.hz2k || 0,
    noiseData.hz4k || 0,
    noiseData.hz8k || 0,
  ];
  
  // Check if any octave band data has meaningful values (>= 10 dB, not just placeholders)
  const hasOctaveBands = octaveBands.some(v => v >= 10);
  
  // Helper to estimate NC from overall dB(A) value (ONLY used when no octave bands)
  // Standard thumb rule: NC ≈ overall dB(A) - 5
  const estimateNCFromOverall = (overallDb: number): number => {
    const estimatedNC = overallDb - 5;
    // Round to nearest 5 (NC levels are 15, 20, 25, 30, etc.)
    return Math.round(estimatedNC / 5) * 5;
  };
  
  let resultNC = 85; // Default to highest if no curve is met
  
  // If no octave band data but overall exists, estimate from overall
  if (!hasOctaveBands && noiseData.overall && noiseData.overall > 0) {
    resultNC = estimateNCFromOverall(noiseData.overall);
  } else if (hasOctaveBands) {
    // NC rating is the lowest NC curve where ALL bands are at or below the curve values
    const ncLevels = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
    
    for (const ncNum of ncLevels) {
      const curveValues = ncCurves[ncNum];
      let meetsThisCurve = true;
      for (let i = 0; i < 8; i++) {
        if (octaveBands[i] > curveValues[i]) {
          meetsThisCurve = false;
          break;
        }
      }
      if (meetsThisCurve) {
        resultNC = ncNum;
        break; // Found the lowest NC curve that is met
      }
    }
  }
  
  // Description based on NC level
  let description = '';
  if (resultNC <= 20) description = 'Concert hall, recording studio';
  else if (resultNC <= 30) description = 'Private office, quiet library';
  else if (resultNC <= 35) description = 'Conference room, classroom';
  else if (resultNC <= 40) description = 'Open office, restaurant';
  else if (resultNC <= 50) description = 'Lobby, retail store';
  else if (resultNC <= 60) description = 'Light industrial, workshop';
  else description = 'Heavy industrial';
  
  return { level: resultNC, description };
}

// Custom certification interface
interface CustomCertification {
  name: string;
  logo_url?: string;
}

// Color palette matching UI
const COLORS = {
  primary: [0, 0, 0] as [number, number, number], // Black for fan curve
  primaryLight: [191, 219, 254] as [number, number, number],
  secondary: [249, 115, 22] as [number, number, number],
  success: [34, 197, 94] as [number, number, number],
  successLight: [187, 247, 208] as [number, number, number],
  warning: [234, 179, 8] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  text: [40, 40, 40] as [number, number, number],
  textLight: [100, 100, 100] as [number, number, number],
  border: [220, 220, 220] as [number, number, number],
  gridLight: [240, 240, 240] as [number, number, number],
  background: [252, 252, 252] as [number, number, number],
};

// Family curve colors matching the web UI (MultiAnglePerformanceChart.tsx)
const ANGLE_COLORS: Record<number, [number, number, number]> = {
  20: [191, 64, 64],    // hsl(0, 70%, 50%) - red
  25: [217, 140, 51],   // hsl(30, 70%, 50%) - orange
  30: [204, 179, 23],   // hsl(60, 70%, 45%) - yellow
  35: [31, 163, 51],    // hsl(120, 70%, 40%) - green
  40: [31, 163, 163],   // hsl(180, 70%, 40%) - cyan
  45: [16, 106, 237],   // hsl(213, 94%, 50%) - blue (selected angle)
  50: [140, 64, 191],   // hsl(270, 70%, 50%) - purple
};

// Smooth a polyline with monotone cubic Hermite interpolation. The curve
// passes through every measured catalogue point and avoids spline overshoot.
function smoothMonotonePoints(
  points: { x: number; y: number }[],
  samplesPerSegment = 12,
): { x: number; y: number }[] {
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
    tangents[i] = slopes[i - 1] * slopes[i] <= 0
      ? 0
      : (slopes[i - 1] + slopes[i]) / 2;
  }
  // Fritsch-Carlson limiting prevents overshoot between measured values.
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
  const output: { x: number; y: number }[] = [];
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
        y:
          (2 * t3 - 3 * t2 + 1) * p0.y +
          (t3 - 2 * t2 + t) * dx * tangents[i] +
          (-2 * t3 + 3 * t2) * p1.y +
          (t3 - t2) * dx * tangents[i + 1],
      });
    }
  }
  output.push(points[n - 1]);
  return output;
}

// Draw performance curve matching web Recharts style exactly - IMPROVED READABILITY
function drawPerformanceCurve(
  doc: jsPDF,
  data: { x: number; y: number }[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    yLabel: string;
    xLabel: string;
    lineColor: [number, number, number];
    dutyPoint?: { x: number; y: number };
    showArea?: boolean;
    sharedXMax?: number;
    sharedYMax?: number; // Add shared Y-axis max for consistent scaling with base curve
    showSystemCurve?: boolean;
    stallZone?: { minPercent: number; maxPercent: number }; // Stall zone percentages
    // Base curve data for VFD comparison
    baseCurve?: {
      data: { x: number; y: number }[];
      label: string;
      dutyPoint?: { x: number; y: number };
    };
    // Optional: Use base duty point for system curve (when VFD is active)
    systemCurveDutyPoint?: { x: number; y: number };
    // Label for adjusted curve (e.g., "45Hz" or "180V")
    adjustedCurveLabel?: string;
  }
) {
  if (data.length < 2) return;

  // Reduced top margin since title is already outside
  const margin = { top: 2, right: 12, bottom: 16, left: 14 };
  const chartX = x + margin.left;
  const chartY = y + margin.top;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Sort data by x (airflow) ascending - same as webpage
  const sortedData = [...data].sort((a, b) => a.x - b.x);
  
  const xValues = sortedData.map(d => d.x);
  const yValues = sortedData.map(d => d.y);
  
  // Recharts auto-calculates bounds from data - match that behavior
  const dataXMax = Math.max(...xValues);
  const dataYMin = Math.min(...yValues);
  let dataYMax = Math.max(...yValues);
  
  // Include base curve Y values in axis calculation to ensure curves stay within bounds
  if (options.baseCurve && options.baseCurve.data.length > 0) {
    const baseYMax = Math.max(...options.baseCurve.data.map(d => d.y));
    dataYMax = Math.max(dataYMax, baseYMax);
  }
  
  // X-axis: ALWAYS start from 0 to avoid gap between Y-axis and curve (match webpage)
  // Axis limit follows the catalogue curve, with exactly 10% headroom.
  const xMin = 0;
  const rawXMax = options.sharedXMax || dataXMax;
  const xMax = rawXMax * 1.10;
  
  // Y-axis follows the maximum catalogue pressure with exactly 10% headroom.
  // Include a comparison/base curve maximum when one is displayed.
  const yMin = 0;
  const yMax = (options.sharedYMax || dataYMax) * 1.10;

  // Helper: Calculate nice tick values like Recharts
  const calculateNiceTicks = (min: number, max: number, targetCount: number): number[] => {
    const range = max - min;
    if (range === 0) return [min];
    
    const roughStep = range / targetCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const residual = roughStep / magnitude;
    
    let niceStep: number;
    if (residual <= 1.5) niceStep = magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;
    
    const ticks: number[] = [];
    let tick = Math.floor(min / niceStep) * niceStep;
    while (tick <= max * 1.001) {
      if (tick >= min - niceStep * 0.1) {
        ticks.push(tick);
      }
      tick += niceStep;
    }
    
    return ticks;
  };

  // Background - clean white
  doc.setFillColor(255, 255, 255);
  doc.rect(chartX, chartY, chartWidth, chartHeight, 'F');

  // Calculate tick values - match webpage intervals (8 for X-axis, 6 for Y-axis)
  const xTicks = calculateNiceTicks(xMin, xMax, 8);
  const yTicks = calculateNiceTicks(yMin, yMax, 6);

  // Axis lines with arrows (no grid lines)
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.4);
  const axisExtend = 2;
  const arrowSize = 1.2;
  const tickLength = 1.5;
  
  // X-axis with arrow
  doc.line(chartX, chartY + chartHeight, chartX + chartWidth + axisExtend, chartY + chartHeight);
  // X-axis arrow head
  doc.setFillColor(50, 50, 50);
  doc.triangle(
    chartX + chartWidth + axisExtend + arrowSize, chartY + chartHeight,
    chartX + chartWidth + axisExtend - arrowSize, chartY + chartHeight - arrowSize,
    chartX + chartWidth + axisExtend - arrowSize, chartY + chartHeight + arrowSize,
    'F'
  );
  
  // Y-axis with arrow
  doc.line(chartX, chartY - axisExtend, chartX, chartY + chartHeight);
  // Y-axis arrow head
  doc.triangle(
    chartX, chartY - axisExtend - arrowSize,
    chartX - arrowSize, chartY - axisExtend + arrowSize,
    chartX + arrowSize, chartY - axisExtend + arrowSize,
    'F'
  );
  
  // X-axis tick marks
  doc.setLineWidth(0.25);
  for (const tick of xTicks) {
    const xPos = chartX + ((tick - xMin) / (xMax - xMin)) * chartWidth;
    doc.line(xPos, chartY + chartHeight, xPos, chartY + chartHeight + tickLength);
  }
  
  // Y-axis tick marks
  for (const tick of yTicks) {
    const yPos = chartY + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
    doc.line(chartX - tickLength, yPos, chartX, yPos);
  }

  // Y-axis label - rotated -90 degrees, LARGER FONT
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  const yLabelX = chartX - 11;
  const yLabelY = chartY + chartHeight / 2;
  doc.text(options.yLabel, yLabelX, yLabelY, { angle: 90, align: 'center' });

  // Y-axis tick labels - LARGER FONT, clear positioning
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  for (const tick of yTicks) {
    const yPos = chartY + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
    let displayValue: string;
    if (tick === 0) displayValue = '0';
    else if (tick < 1) displayValue = tick.toFixed(2);
    else if (tick < 10) displayValue = tick.toFixed(1);
    else if (tick < 100) displayValue = Math.round(tick).toString();
    else displayValue = Math.round(tick).toLocaleString();
    doc.text(displayValue, chartX - 2.5, yPos + 0.8, { align: 'right' });
  }

  // X-axis tick labels - LARGER FONT
  doc.setFontSize(8);
  for (const tick of xTicks) {
    const xPos = chartX + ((tick - xMin) / (xMax - xMin)) * chartWidth;
    let displayValue: string;
    if (tick === 0) displayValue = '0';
    else if (tick >= 1000) displayValue = Math.round(tick).toLocaleString();
    else if (tick >= 100) displayValue = Math.round(tick).toString();
    else if (tick >= 10) displayValue = tick.toFixed(1);
    else displayValue = tick.toFixed(2);
    doc.text(displayValue, xPos, chartY + chartHeight + 4.5, { align: 'center' });
  }

  // X-axis label - LARGER FONT
  doc.setFontSize(9);
  doc.text(options.xLabel, chartX + chartWidth / 2, chartY + chartHeight + 10, { align: 'center' });

  // Convert data points to chart coordinates
  const xAxisY = chartY + chartHeight;
  
  const chartPoints = sortedData.map(point => {
    const xCoord = chartX + ((point.x - xMin) / (xMax - xMin)) * chartWidth;
    const yCoord = point.y <= 0 
      ? xAxisY 
      : chartY + chartHeight - ((point.y - yMin) / (yMax - yMin)) * chartHeight;
    return { x: xCoord, y: Math.min(yCoord, xAxisY) };
  });

  // Draw grid lines - dashed
  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.2, 1.2], 0);
  
  // Horizontal grid lines at Y ticks
  for (const tick of yTicks) {
    if (tick === yMin) continue;
    const yPos = chartY + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
    doc.line(chartX, yPos, chartX + chartWidth, yPos);
  }
  
  // Vertical grid lines at X ticks
  for (const tick of xTicks) {
    if (tick === xMin) continue;
    const xPos = chartX + ((tick - xMin) / (xMax - xMin)) * chartWidth;
    doc.line(xPos, chartY, xPos, chartY + chartHeight);
  }
  doc.setLineDashPattern([], 0);

  // Draw stall zone shading (for fan curve only) - BEFORE curve
  if (options.stallZone && options.stallZone.minPercent > 0) {
    const dataXMax = Math.max(...sortedData.map(d => d.x));
    const stallMaxX = dataXMax * (options.stallZone.minPercent / 100);
    const stallMaxX2 = dataXMax * (options.stallZone.maxPercent / 100);
    
    // Left stall zone (low airflow)
    const stallLeftXPos = chartX;
    const stallLeftWidth = ((stallMaxX - xMin) / (xMax - xMin)) * chartWidth;
    
    if (stallLeftWidth > 0) {
      doc.setFillColor(255, 200, 200); // Light red for stall zone
      doc.rect(stallLeftXPos, chartY, stallLeftWidth, chartHeight, 'F');
      
      // Add "STALL" label
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 60, 60);
      if (stallLeftWidth > 10) {
        doc.text('STALL', stallLeftXPos + stallLeftWidth / 2, chartY + 6, { align: 'center' });
      }
    }
    
    // Right stall zone (high airflow beyond max safe)
    if (options.stallZone.maxPercent < 100) {
      const stallRightXPos = chartX + ((stallMaxX2 - xMin) / (xMax - xMin)) * chartWidth;
      const stallRightWidth = chartWidth - stallRightXPos + chartX;
      
      if (stallRightWidth > 0) {
        doc.setFillColor(255, 220, 180); // Light orange for high airflow zone
        doc.rect(stallRightXPos, chartY, stallRightWidth, chartHeight, 'F');
      }
    }
  }
  if (options.showArea && chartPoints.length > 1) {
    const lightColor: [number, number, number] = [
      Math.round(255 - (255 - options.lineColor[0]) * 0.12),
      Math.round(255 - (255 - options.lineColor[1]) * 0.12),
      Math.round(255 - (255 - options.lineColor[2]) * 0.12),
    ];
    doc.setFillColor(...lightColor);
    
    doc.moveTo(chartPoints[0].x, chartY + chartHeight);
    for (const point of chartPoints) {
      doc.lineTo(point.x, point.y);
    }
    doc.lineTo(chartPoints[chartPoints.length - 1].x, chartY + chartHeight);
    doc.fill();
  }

  // Draw base curve first (if VFD active) - dashed gray line
  if (options.baseCurve && options.baseCurve.data.length >= 2) {
    const baseSortedData = [...options.baseCurve.data].sort((a, b) => a.x - b.x);
    const baseChartPoints = baseSortedData.map(point => {
      const xCoord = chartX + ((point.x - xMin) / (xMax - xMin)) * chartWidth;
      const yCoord = point.y <= 0 
        ? xAxisY 
        : chartY + chartHeight - ((point.y - yMin) / (yMax - yMin)) * chartHeight;
      return { x: xCoord, y: Math.min(yCoord, xAxisY) };
    });
    
    // Draw dashed gray base curve
    doc.setDrawColor(140, 140, 140);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([3, 2], 0);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    
    const smoothBasePoints = smoothMonotonePoints(baseChartPoints);
    for (let i = 0; i < smoothBasePoints.length - 1; i++) {
      doc.line(smoothBasePoints[i].x, smoothBasePoints[i].y, smoothBasePoints[i + 1].x, smoothBasePoints[i + 1].y);
    }
    doc.setLineDashPattern([], 0);
    
    // Draw base curve operating point (hollow gray circle)
    if (options.baseCurve.dutyPoint && options.baseCurve.dutyPoint.x > 0 && options.baseCurve.dutyPoint.y > 0) {
      const baseDpX = chartX + ((options.baseCurve.dutyPoint.x - xMin) / (xMax - xMin)) * chartWidth;
      const baseDpY = chartY + chartHeight - ((options.baseCurve.dutyPoint.y - yMin) / (yMax - yMin)) * chartHeight;
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.5);
      doc.circle(baseDpX, baseDpY, 1.5, 'S');
    }
    
    // Add base curve label at end of curve
    const lastBasePoint = baseChartPoints[baseChartPoints.length - 1];
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(options.baseCurve.label, lastBasePoint.x + 2, lastBasePoint.y - 1);
  }

  // Draw a smooth monotone curve through the exact catalogue points.
  doc.setDrawColor(...options.lineColor);
  doc.setLineWidth(0.5);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  
  const smoothMainPoints = smoothMonotonePoints(chartPoints);
  for (let i = 0; i < smoothMainPoints.length - 1; i++) {
    doc.line(smoothMainPoints[i].x, smoothMainPoints[i].y, smoothMainPoints[i + 1].x, smoothMainPoints[i + 1].y);
  }
  
  // Add adjusted curve label at end of curve (when VFD/voltage is active)
  if (options.adjustedCurveLabel && chartPoints.length > 0) {
    const lastMainPoint = chartPoints[chartPoints.length - 1];
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...options.lineColor);
    doc.text(options.adjustedCurveLabel, lastMainPoint.x + 2, lastMainPoint.y - 1);
  }

  // CRITICAL: Use systemCurveDutyPoint (base 50Hz) if provided, otherwise use current dutyPoint
  // The system curve represents the system's resistance which is FIXED regardless of fan speed
  const systemDutyPoint = options.systemCurveDutyPoint || options.dutyPoint;
  if (options.showSystemCurve && systemDutyPoint && systemDutyPoint.x > 0 && systemDutyPoint.y > 0) {
    const k = systemDutyPoint.y / (systemDutyPoint.x * systemDutyPoint.x);
    
    doc.setDrawColor(200, 30, 30);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([1.5, 1.5], 0);
    
    const maxQ = Math.min(systemDutyPoint.x * 1.2, xMax);
    const steps = 40;
    
    let prevX: number | null = null;
    let prevY: number | null = null;
    
    for (let i = 0; i <= steps; i++) {
      const q = (maxQ * i) / steps;
      const p = k * q * q;
      
      const px = chartX + ((q - xMin) / (xMax - xMin)) * chartWidth;
      const py = chartY + chartHeight - ((p - yMin) / (yMax - yMin)) * chartHeight;
      
      if (py >= chartY && prevX !== null && prevY !== null && prevY >= chartY) {
        doc.line(prevX, prevY, px, py);
      }
      prevX = px;
      prevY = py;
    }
    doc.setLineDashPattern([], 0);
  }

  // Duty point with guide lines
  if (options.dutyPoint && options.dutyPoint.x > 0 && options.dutyPoint.y > 0) {
    const dpX = chartX + ((options.dutyPoint.x - xMin) / (xMax - xMin)) * chartWidth;
    const dpY = chartY + chartHeight - ((options.dutyPoint.y - yMin) / (yMax - yMin)) * chartHeight;
    
    // Draw dashed guide lines from axes TO duty point - THICKER
    doc.setDrawColor(240, 120, 20);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([2, 1.5], 0); // strokeDasharray "4 3" scaled
    
    // Horizontal guide line from Y-axis to duty point
    doc.line(chartX, dpY, dpX, dpY);
    
    // Vertical guide line from X-axis to duty point
    doc.line(dpX, chartY + chartHeight, dpX, dpY);
    
    doc.setLineDashPattern([], 0);
    
    // Draw duty point circle - red like webpage hsl(0, 70%, 50%)
    doc.setFillColor(217, 38, 38);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6); // strokeWidth 2 scaled
    doc.circle(dpX, dpY, 1.8, 'FD'); // r=5 scaled to PDF
  }
}

// Draw family performance curves (multiple blade angles) with legend
function drawFamilyPerformanceCurves(
  doc: jsPDF,
  familyData: { angle: number; data: { x: number; y: number }[] }[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    yLabel: string;
    xLabel: string;
    dutyPoint?: { x: number; y: number };
    selectedAngle?: number;
    chartType: 'pressure' | 'power' | 'efficiency';
  }
) {
  if (familyData.length === 0) return;

  // Reduced top margin since title is already outside
  const margin = { top: 2, right: 12, bottom: 16, left: 14 };
  const chartX = x + margin.left;
  const chartY = y + margin.top;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Get all data points from all curves to calculate axis bounds
  const allPoints: { x: number; y: number }[] = [];
  familyData.forEach(curve => {
    curve.data.forEach(point => allPoints.push(point));
  });

  if (allPoints.length === 0) return;

  const xValues = allPoints.map(d => d.x);
  const yValues = allPoints.map(d => d.y);
  
  // X-axis: ALWAYS start from 0
  const xMin = 0;
  const xMax = Math.max(...xValues) * 1.15;
  
  // Y-axis: start from 0, add 15% padding
  const yMin = 0;
  const yMax = Math.max(...yValues) * 1.15;

  // Helper: Calculate nice tick values
  const calculateNiceTicks = (min: number, max: number, targetCount: number): number[] => {
    const range = max - min;
    if (range === 0) return [min];
    
    const roughStep = range / targetCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const residual = roughStep / magnitude;
    
    let niceStep: number;
    if (residual <= 1.5) niceStep = magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;
    
    const ticks: number[] = [];
    let tick = Math.floor(min / niceStep) * niceStep;
    while (tick <= max * 1.001) {
      if (tick >= min - niceStep * 0.1) {
        ticks.push(tick);
      }
      tick += niceStep;
    }
    
    return ticks;
  };

  // Background - clean white
  doc.setFillColor(255, 255, 255);
  doc.rect(chartX, chartY, chartWidth, chartHeight, 'F');

  // Calculate tick values
  const xTicks = calculateNiceTicks(xMin, xMax, 8);
  const yTicks = calculateNiceTicks(yMin, yMax, 6);

  // Axis lines with arrows
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.4);
  const axisExtend = 2;
  const arrowSize = 1.2;
  const tickLength = 1.5;
  
  // X-axis with arrow
  doc.line(chartX, chartY + chartHeight, chartX + chartWidth + axisExtend, chartY + chartHeight);
  doc.setFillColor(50, 50, 50);
  doc.triangle(
    chartX + chartWidth + axisExtend + arrowSize, chartY + chartHeight,
    chartX + chartWidth + axisExtend - arrowSize, chartY + chartHeight - arrowSize,
    chartX + chartWidth + axisExtend - arrowSize, chartY + chartHeight + arrowSize,
    'F'
  );
  
  // Y-axis with arrow
  doc.line(chartX, chartY - axisExtend, chartX, chartY + chartHeight);
  doc.triangle(
    chartX, chartY - axisExtend - arrowSize,
    chartX - arrowSize, chartY - axisExtend + arrowSize,
    chartX + arrowSize, chartY - axisExtend + arrowSize,
    'F'
  );
  
  // X-axis tick marks
  doc.setLineWidth(0.25);
  for (const tick of xTicks) {
    const xPos = chartX + ((tick - xMin) / (xMax - xMin)) * chartWidth;
    doc.line(xPos, chartY + chartHeight, xPos, chartY + chartHeight + tickLength);
  }
  
  // Y-axis tick marks
  for (const tick of yTicks) {
    const yPos = chartY + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
    doc.line(chartX - tickLength, yPos, chartX, yPos);
  }

  // Y-axis label - rotated
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  const yLabelX = chartX - 11;
  const yLabelY = chartY + chartHeight / 2;
  doc.text(options.yLabel, yLabelX, yLabelY, { angle: 90, align: 'center' });

  // Y-axis tick labels
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  for (const tick of yTicks) {
    const yPos = chartY + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
    let displayValue: string;
    if (tick === 0) displayValue = '0';
    else if (tick < 1) displayValue = tick.toFixed(2);
    else if (tick < 10) displayValue = tick.toFixed(1);
    else if (tick < 100) displayValue = Math.round(tick).toString();
    else displayValue = Math.round(tick).toLocaleString();
    doc.text(displayValue, chartX - 2.5, yPos + 0.8, { align: 'right' });
  }

  // X-axis tick labels
  doc.setFontSize(8);
  for (const tick of xTicks) {
    const xPos = chartX + ((tick - xMin) / (xMax - xMin)) * chartWidth;
    let displayValue: string;
    if (tick === 0) displayValue = '0';
    else if (tick >= 1000) displayValue = Math.round(tick).toLocaleString();
    else if (tick >= 100) displayValue = Math.round(tick).toString();
    else if (tick >= 10) displayValue = tick.toFixed(1);
    else displayValue = tick.toFixed(2);
    doc.text(displayValue, xPos, chartY + chartHeight + 4.5, { align: 'center' });
  }

  // X-axis label
  doc.setFontSize(9);
  doc.text(options.xLabel, chartX + chartWidth / 2, chartY + chartHeight + 10, { align: 'center' });

  // Draw grid lines - lighter and thinner
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.08);
  doc.setLineDashPattern([1, 1.5], 0);
  
  for (const tick of yTicks) {
    if (tick === yMin) continue;
    const yPos = chartY + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
    doc.line(chartX, yPos, chartX + chartWidth, yPos);
  }
  
  for (const tick of xTicks) {
    if (tick === xMin) continue;
    const xPos = chartX + ((tick - xMin) / (xMax - xMin)) * chartWidth;
    doc.line(xPos, chartY, xPos, chartY + chartHeight);
  }
  doc.setLineDashPattern([], 0);

  // Draw all family curves
  const xAxisY = chartY + chartHeight;
  
  familyData.forEach(curve => {
    const sortedData = [...curve.data].sort((a, b) => a.x - b.x);
    
    const chartPoints = sortedData.map(point => {
      const xCoord = chartX + ((point.x - xMin) / (xMax - xMin)) * chartWidth;
      const yCoord = point.y <= 0 
        ? xAxisY 
        : chartY + chartHeight - ((point.y - yMin) / (yMax - yMin)) * chartHeight;
      return { x: xCoord, y: Math.min(yCoord, xAxisY) };
    });

    // Get color for this angle
    const angleColor = ANGLE_COLORS[curve.angle] || COLORS.primary;
    
    // Draw curve line - same thickness for all angles, only color differs
    doc.setDrawColor(...angleColor);
    doc.setLineWidth(0.5);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.setLineCap('round');
    doc.setLineJoin('round');
    
    for (let i = 0; i < chartPoints.length - 1; i++) {
      doc.line(chartPoints[i].x, chartPoints[i].y, chartPoints[i + 1].x, chartPoints[i + 1].y);
    }
  });

  // Draw duty point with guide lines (for all chart types: pressure, power, efficiency)
  if (options.dutyPoint && options.dutyPoint.x > 0 && options.dutyPoint.y > 0) {
    const dpX = chartX + ((options.dutyPoint.x - xMin) / (xMax - xMin)) * chartWidth;
    const dpY = chartY + chartHeight - ((options.dutyPoint.y - yMin) / (yMax - yMin)) * chartHeight;
    
    // Draw dashed guide lines
    doc.setDrawColor(240, 120, 20);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.line(chartX, dpY, dpX, dpY);
    doc.line(dpX, chartY + chartHeight, dpX, dpY);
    doc.setLineDashPattern([], 0);
    
    // Draw duty point circle
    doc.setFillColor(217, 38, 38);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6);
    doc.circle(dpX, dpY, 1.8, 'FD');
  }

  // Draw legend at bottom of chart
  const legendY = chartY + chartHeight + 14;
  const legendStartX = chartX;
  const legendItemWidth = chartWidth / familyData.length;
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  
  familyData.forEach((curve, index) => {
    const itemX = legendStartX + (index * legendItemWidth) + (legendItemWidth / 2);
    const angleColor = ANGLE_COLORS[curve.angle] || COLORS.primary;
    
    // Draw color line - same thickness for all
    doc.setDrawColor(...angleColor);
    doc.setLineWidth(0.4);
    doc.line(itemX - 4, legendY, itemX + 4, legendY);

    // Draw angle label - same style for all
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'normal');
    doc.text(`${curve.angle}°`, itemX, legendY + 2.5, { align: 'center' });
  });
}

// Draw noise chart with color coding - Sound Power Level (Lw) at source
function drawNoiseChart(
  doc: jsPDF,
  noiseData: { hz63?: number; hz125?: number; hz250?: number; hz500?: number; hz1k?: number; hz2k?: number; hz4k?: number; hz8k?: number; overall?: number },
  x: number,
  y: number,
  width: number,
  height: number,
  title: string = 'Sound Power Level (Lw)',
  subtitle?: string
) {
  const bands = [
    { label: '63', value: noiseData.hz63 || 0 },
    { label: '125', value: noiseData.hz125 || 0 },
    { label: '250', value: noiseData.hz250 || 0 },
    { label: '500', value: noiseData.hz500 || 0 },
    { label: '1k', value: noiseData.hz1k || 0 },
    { label: '2k', value: noiseData.hz2k || 0 },
    { label: '4k', value: noiseData.hz4k || 0 },
    { label: '8k', value: noiseData.hz8k || 0 },
  ];

  const margin = { top: 18, right: 8, bottom: 16, left: 20 };
  const chartX = x + margin.left;
  const chartY = y + margin.top;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  const maxValue = Math.max(...bands.map(b => b.value), 90);
  const barTotalWidth = chartWidth / bands.length;
  const barWidth = barTotalWidth * 0.7;

  // Title with overall badge
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  
  // Calculate text width for title to position badge after it
  const titleWidth = doc.getTextWidth(title);
  const titleX = x + width / 2 - titleWidth / 2 - 10;
  doc.text(title, titleX + titleWidth / 2, y + 7, { align: 'center' });
  
  // Subtitle (e.g., "At Source" or "At 3m, Q=2")
  if (subtitle) {
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    doc.text(subtitle, x + width / 2, y + 12, { align: 'center' });
  }

  if (noiseData.overall) {
    // Position badge right after the title with some spacing
    const badgeWidth = 28;
    const badgeHeight = 8;
    const badgeX = titleX + titleWidth + 4;
    const badgeY = y + 2;
    
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    const textX = badgeX + badgeWidth / 2;
    const textY = badgeY + badgeHeight / 2 + 1.2;
    doc.text(`${Math.round(noiseData.overall)} dB(A)`, textX, textY, { align: 'center' });
    doc.setTextColor(...COLORS.text);
  }

  // Axes
  doc.setDrawColor(...COLORS.textLight);
  doc.setLineWidth(0.3);
  doc.line(chartX, chartY, chartX, chartY + chartHeight);
  doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight);

  // Y-axis labels
  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textLight);
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const yPos = chartY + chartHeight - (chartHeight * i) / ySteps;
    const value = Math.round((maxValue * i) / ySteps);
    doc.text(value.toString(), chartX - 2, yPos + 1, { align: 'right' });
    
    if (i > 0) {
      doc.setDrawColor(...COLORS.gridLight);
      doc.setLineWidth(0.1);
      doc.line(chartX, yPos, chartX + chartWidth, yPos);
    }
  }

  // Bars
  bands.forEach((band, i) => {
    const barX = chartX + i * barTotalWidth + (barTotalWidth - barWidth) / 2;
    const barHeight = Math.max(1, (band.value / maxValue) * chartHeight);
    const barY = chartY + chartHeight - barHeight;

    // Color based on dB level
    if (band.value < 50) {
      doc.setFillColor(...COLORS.success);
    } else if (band.value < 65) {
      doc.setFillColor(...COLORS.warning);
    } else if (band.value < 80) {
      doc.setFillColor(...COLORS.secondary);
    } else {
      doc.setFillColor(...COLORS.danger);
    }
    
    if (band.value > 0) {
      doc.roundedRect(barX, barY, barWidth, barHeight, 1, 1, 'F');
      
      // Value on top
      doc.setFontSize(5);
      doc.setTextColor(...COLORS.text);
      doc.text(Math.round(band.value).toString(), barX + barWidth / 2, barY - 2, { align: 'center' });
    }
    
    // Frequency label
    doc.setFontSize(5);
    doc.setTextColor(...COLORS.textLight);
    doc.text(band.label, barX + barWidth / 2, chartY + chartHeight + 5, { align: 'center' });
  });

  doc.setFontSize(5);
  doc.text('Hz', chartX + chartWidth + 3, chartY + chartHeight + 5);
}

// Draw fan technical drawing - loads actual image or bundled fallback with proper aspect ratio
async function drawFanDrawingFromImage(
  doc: jsPDF,
  drawingUrl: string | undefined,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number
): Promise<boolean> {
  // Try to load series-specific drawing first, then fall back to bundled default
  const urlToLoad = drawingUrl || fanTechnicalDrawing;
  
  try {
    const imageData = await loadImageAsBase64(urlToLoad);
    if (imageData) {
      // Determine format from base64 string
      const format = imageData.base64.includes('image/png') ? 'PNG' : 'JPEG';
      
      // Calculate dimensions that preserve aspect ratio
      const aspectRatio = imageData.width / imageData.height;
      let finalWidth = maxWidth;
      let finalHeight = maxWidth / aspectRatio;
      
      // If height exceeds max, scale down
      if (finalHeight > maxHeight) {
        finalHeight = maxHeight;
        finalWidth = maxHeight * aspectRatio;
      }
      
      // Center the image within the available space
      const centeredX = x + (maxWidth - finalWidth) / 2;
      
      // Add the drawing image with compression set to NONE for better quality
      doc.addImage(imageData.base64, format, centeredX, y, finalWidth, finalHeight, undefined, 'NONE');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// Fallback: Draw simple placeholder text when no drawing image available
function drawDrawingPlaceholder(
  doc: jsPDF,
  diameter: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  // Border
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.rect(x, y, width, height);
  
  // Placeholder text
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textLight);
  doc.text('Technical Drawing', x + width / 2, y + height / 2 - 5, { align: 'center' });
  doc.text(`Ø${diameter} mm`, x + width / 2, y + height / 2 + 5, { align: 'center' });
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('(Upload drawing in Admin Portal)', x + width / 2, y + height / 2 + 12, { align: 'center' });
}

// Draw specification section
function drawSpecSection(
  doc: jsPDF,
  title: string,
  items: [string, string][],
  x: number,
  y: number,
  width: number
): number {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text(title, x, y);
  
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(x, y + 1.5, x + width, y + 1.5);
  
  let currentY = y + 5.5;
  doc.setFontSize(7.5);
  
  items.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    doc.text(label, x, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    doc.text(value, x + width, currentY, { align: 'right' });
    
    currentY += 4;
  });
  
  return currentY + 1;
}

export async function generateEnhancedDatasheet(options: DatasheetOptions): Promise<jsPDF> {
  const { 
    selection, 
    database, 
    airflowUnit, 
    pressureUnit, 
    performanceData, 
    fanRPM,
    multiFanQuantity = 1,
    multiFanArrangement = 'parallel',
    outletVelocity, 
    dynamicPressure, 
    totalPressure, 
    casingWeight, 
    impellerWeight, 
    motorWeight, 
    motorSpec,
    fanDimensions,
    airDensity = 1.2,
    temperature = 20,
    altitude = 0,
    noiseDistance = 3, // Default 3m distance
    noiseDirectivityQ = 2, // Default Q=2 (half-sphere)
    showOctaveBands = true, // Default to showing octave bands
    amcaCertified = false,
    fireRating,
    amcaLogoUrl,
    fireRatingLogoUrl,
    datasheetDescription,
    // Speed control settings
    vfdEnabled = false,
    vfdFrequency,
    voltageDriveEnabled = false,
    driveVoltage,
    nominalVoltage,
    motorPhase = 3,
    adjustedNoiseData,
    // Family curve display
    showFamilyCurve = false,
    familyCurveData,
    // New datasheet features
    iomUrl,
    soundOutletReduction = 0,
    stallAirflowMinPercent = 15,
    stallAirflowMaxPercent = 95,
    compatibleAccessories = [],
    // Base curve data for VFD comparison
    baseCurveData,
    // Project mode options
    existingDoc,
    skipSave = false,
    pageLabel,
  } = options;
  // The airflow-twin and combined-system pages are optional engineering pages.
  // A normal single-fan datasheet remains two pages; these pages appear only
  // after the user selects two or more fans in series or parallel.
  const hasActivatedMultiFanSystem =
    multiFanQuantity > 1 &&
    (multiFanArrangement === 'series' || multiFanArrangement === 'parallel');
  const totalDatasheetPages = hasActivatedMultiFanSystem ? 4 : 2;
  
  // Fetch datasheet config from database if not provided
  // CRITICAL: Use seriesId (UUID) not series (name) for database lookup
  let config = options.datasheetConfig;
  const seriesIdForConfig = selection.seriesId;
  
  if (!config && seriesIdForConfig) {
    try {
      config = await fetchDatasheetConfig(seriesIdForConfig);
      console.log('PDF Generator - Loaded datasheet config for series UUID:', seriesIdForConfig);
      console.log('PDF Generator - Config loaded:', config ? 'Yes' : 'Using defaults');
      console.log('PDF Generator - show_efficiency:', (config as any)?.show_efficiency);
      console.log('PDF Generator - show_power_curve:', (config as any)?.show_power_curve);
      console.log('PDF Generator - show_efficiency_curve:', (config as any)?.show_efficiency_curve);
    } catch (e) {
      console.warn('Could not fetch datasheet config, using defaults:', e);
    }
  } else if (!config && !seriesIdForConfig) {
    console.warn('PDF Generator - No seriesId available, cannot fetch config');
  }
  
  // Log new datasheet feature options
  console.log('PDF Generator - New Features:', {
    iomUrl,
    soundOutletReduction,
    stallAirflowMinPercent,
    stallAirflowMaxPercent,
    compatibleAccessories,
  });
  
  // Fetch accessory and fire rating descriptions from database
  let accessoryDescriptions: Record<string, string> = {};
  let fireRatingDescriptions: Record<string, string> = {};
  
  try {
    const { data: accData } = await supabase.from('accessory_descriptions').select('accessory_code, description');
    if (accData) {
      accData.forEach(acc => {
        accessoryDescriptions[acc.accessory_code] = acc.description;
      });
    }
    
    const { data: fireData } = await supabase.from('fire_rating_descriptions').select('fire_class, description');
    if (fireData) {
      fireData.forEach(fr => {
        fireRatingDescriptions[fr.fire_class] = fr.description;
      });
    }
  } catch (e) {
    console.warn('Could not fetch accessory/fire rating descriptions:', e);
  }
  
  // Use existing document or create new one
  const doc = existingDoc || new jsPDF();
  const isAppendMode = !!existingDoc;
  
  // If appending, add a new page first
  if (isAppendMode) {
    doc.addPage();
  }
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Find series info - try by seriesId first (UUID), then fall back to name match
  const seriesInfo = database.series.find(s => s.id === selection.seriesId) || 
                     database.series.find(s => s.name === selection.series);
  const seriesName = seriesInfo?.name || selection.series || 'Fan Series';
  const seriesDrawingUrl = seriesInfo?.drawingUrl || options.seriesDrawingUrl;
  const totalWeightVal = casingWeight + impellerWeight + motorWeight;
  
  // Use config values first, then seriesInfo, then fall back to options
  const effectiveShowOctaveBands = config?.show_octave_bands ?? seriesInfo?.showOctaveBands ?? showOctaveBands;
  const effectiveAmcaCertified = seriesInfo?.amcaCertified ?? amcaCertified;
  const effectiveFireRating = seriesInfo?.fireRating || fireRating;
  const effectiveAmcaLogoUrl = seriesInfo?.amcaLogoUrl || amcaLogoUrl;
  const effectiveFireRatingLogoUrl = seriesInfo?.fireRatingLogoUrl || fireRatingLogoUrl;
  
  // Additional certifications from series
  const effectiveCeCertified = seriesInfo?.ceCertified ?? false;
  const effectiveCeLogoUrl = seriesInfo?.ceLogoUrl;
  const effectiveUlCertified = seriesInfo?.ulCertified ?? false;
  const effectiveUlLogoUrl = seriesInfo?.ulLogoUrl;
  const effectiveIsoCertified = seriesInfo?.isoCertified ?? false;
  const effectiveIsoLogoUrl = seriesInfo?.isoLogoUrl;
  const effectiveAtexCertified = seriesInfo?.atexCertified ?? false;
  const effectiveAtexLogoUrl = seriesInfo?.atexLogoUrl;
  
  // Section visibility from config
  const showDescription = config?.show_description ?? true;
  const showDutyPoint = config?.show_duty_point ?? true;
  const showOperatingPoint = config?.show_operating_point ?? true;
  const showConstruction = config?.show_construction ?? true;
  const showMotorCharacteristics = config?.show_motor_characteristics ?? true;
  const showPerformanceCurves = config?.show_performance_curves ?? true;
  const showNoiseSection = config?.show_noise_section ?? true;
  const showTechnicalDrawing = config?.show_technical_drawing ?? true;
  const showDimensionsTable = config?.show_dimensions_table ?? true;
  const showCertifications = config?.show_certifications ?? true;
  const showStandardNotes = config?.show_standard_notes ?? true;
  
  // Use adjusted noise data if available (when VFD/voltage drive is active), otherwise use selection.noiseData
  const effectiveNoiseData = adjustedNoiseData || selection.noiseData;
  
  // Determine if speed control is active
  const isSpeedControlActive = (motorPhase === 3 && vfdEnabled && vfdFrequency !== undefined) ||
                                (motorPhase === 1 && voltageDriveEnabled && driveVoltage !== undefined);
  
  // Calculate speed ratio for VFD (3-phase) or voltage drive (1-phase)
  let speedRatio = 1;
  let adjustedCurveLabel: string | undefined = undefined;
  if (motorPhase === 3 && vfdEnabled && vfdFrequency !== undefined) {
    const baseFreq = 50; // Standard base frequency
    speedRatio = vfdFrequency / baseFreq;
    adjustedCurveLabel = `${Math.round(vfdFrequency)}Hz`;
  } else if (motorPhase === 1 && voltageDriveEnabled && driveVoltage !== undefined && nominalVoltage) {
    speedRatio = driveVoltage / nominalVoltage;
    adjustedCurveLabel = `${Math.round(driveVoltage)}V`;
  }
  
  // Calculate adjusted operating point using fan laws when speed control is active
  const adjustedOperatingPoint = {
    airflow: Math.round(selection.operatingPoint.airflow * speedRatio),
    staticPressure: Math.round(selection.operatingPoint.staticPressure * Math.pow(speedRatio, 2) * 10) / 10,
    shaftPower: Math.round(selection.operatingPoint.shaftPower * Math.pow(speedRatio, 3) * 1000) / 1000,
    efficiency: selection.operatingPoint.efficiency, // Efficiency remains approximately constant
  };
  
  // Use adjusted values when speed control is active, otherwise use base values
  const effectiveOperatingPoint = isSpeedControlActive ? adjustedOperatingPoint : selection.operatingPoint;
  
  // Convert to display units - use effective (adjusted) values
  const displayAirflow = effectiveOperatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor;
  const displayPressure = effectiveOperatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor;
  
  // Duty Point = what the user actually asked for (falls back to the operating
  // point for selections that carry no requested duty, e.g. manual overrides).
  const requestedAirflow = (selection as any).requiredAirflow;
  const requestedPressure = (selection as any).requiredPressure;
  const dutyAirflowCMH =
    typeof requestedAirflow === 'number' && requestedAirflow > 0
      ? requestedAirflow
      : selection.operatingPoint.airflow;
  const dutyPressurePa =
    typeof requestedPressure === 'number' && requestedPressure > 0
      ? requestedPressure
      : selection.operatingPoint.staticPressure;
  const baseDisplayAirflow = dutyAirflowCMH * AIRFLOW_UNITS[airflowUnit].factor;
  const baseDisplayPressure = dutyPressurePa * PRESSURE_UNITS[pressureUnit].factor;
  
  const displayDynamicPressure = dynamicPressure * PRESSURE_UNITS[pressureUnit].factor;
  const displayTotalPressure = totalPressure * PRESSURE_UNITS[pressureUnit].factor;
  
  // Calculate SFP using effective operating point
  const airflowLPS = effectiveOperatingPoint.airflow / 3.6;
  const sfp = airflowLPS > 0 ? (effectiveOperatingPoint.shaftPower * 1000) / airflowLPS : 0;

  // ===== PAGE 1 =====
  
  // Header bar - WHITE color
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 26, 'F');
  
  // Border line at bottom of header
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(0, 26, pageWidth, 26);
  
  // Load logo dynamically from database (smaller height)
  let logoLoaded = false;
  if (database.logoUrl) {
    try {
      const logoData = await loadImageAsBase64(database.logoUrl);
      if (logoData) {
        doc.addImage(logoData.base64, 'PNG', 6, 4, 40, 18);
        logoLoaded = true;
      }
    } catch {
      logoLoaded = false;
    }
  }
  
  if (!logoLoaded) {
    // Fallback to company name text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(database.companyName || 'Fan Selector', 21, 13, { align: 'center' });
  }
  
  // Technical Datasheet title - centered bold (editable)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  const headerTitle = config?.header_title || 'Technical Datasheet';
  doc.text(headerTitle, pageWidth / 2, 14, { align: 'center' });
  
  // Series photo on the right side of header - maintain aspect ratio
  if (seriesInfo?.imageUrl) {
    try {
      const seriesImageData = await loadImageAsBase64(seriesInfo.imageUrl);
      if (seriesImageData) {
        const format = seriesImageData.base64.includes('image/png') ? 'PNG' : 'JPEG';
        // Calculate dimensions that preserve aspect ratio
        const maxSize = 24;
        const aspectRatio = seriesImageData.width / seriesImageData.height;
        let imgWidth = maxSize;
        let imgHeight = maxSize;
        if (aspectRatio > 1) {
          imgHeight = maxSize / aspectRatio;
        } else {
          imgWidth = maxSize * aspectRatio;
        }
        // Center vertically in header
        const imgY = 1 + (maxSize - imgHeight) / 2;
        const imgX = pageWidth - 4 - imgWidth;
        doc.addImage(seriesImageData.base64, format, imgX, imgY, imgWidth, imgHeight, undefined, 'NONE');
      }
    } catch {
      // Silently fail if series image can't be loaded
    }
  }
  
  // MODEL NAME AT TOP - Before description
  let currentY = 32;
  
  // Model code bold with "Model : " prefix - NO certification badges here (they go at bottom)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text(`Model : ${selection.nomenclature}`, 10, currentY);
  doc.setTextColor(...COLORS.text);
  currentY += 6;
  
  // Description - AFTER model name
  if (showDescription) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textLight);
    doc.setFont('helvetica', 'normal');
    
    // Use config custom description FIRST, then series-specific description
    // No hardcoded fallback - if no description configured, skip this section
    const descriptionText = config?.custom_description || seriesInfo?.datasheetDescription || datasheetDescription;
    
    if (descriptionText) {
      const splitDesc = doc.splitTextToSize(descriptionText, pageWidth - 20);
      doc.text(splitDesc, 10, currentY);
      currentY += splitDesc.length * 3 + 2;
    }
    
    // Add Accessory description if selected (from database or fallback to hardcoded)
    if (selection.accessory) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.primary);
      doc.text(`${selection.accessory}:`, 10, currentY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.textLight);
      // Use database description first, fallback to hardcoded
      const accessoryDesc = accessoryDescriptions[selection.accessory] || ACCESSORY_DESCRIPTIONS[selection.accessory as AccessoryType] || '';
      if (accessoryDesc) {
        const splitAccessory = doc.splitTextToSize(accessoryDesc, pageWidth - 30);
        doc.text(splitAccessory, 22, currentY);
        currentY += splitAccessory.length * 3 + 2;
      }
    }
    
    // Add Fire Rating description if selected (from database or fallback to hardcoded)
    if (selection.fireClass) {
      // Use database description first, fallback to hardcoded
      const fireDesc = fireRatingDescriptions[selection.fireClass] || 
        (selection.fireClass === 'F300' ? 'Certified for continuous operation at temperatures up to 300°C for 2 hours, suitable for smoke extraction and fire safety applications.' :
         selection.fireClass === 'F400' ? 'Certified for continuous operation at temperatures up to 400°C for 2 hours, designed for high-temperature smoke extraction in critical fire safety systems.' : '');
      
      if (fireDesc) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primary);
        doc.text(`${selection.fireClass}:`, 10, currentY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textLight);
        const splitFire = doc.splitTextToSize(fireDesc, pageWidth - 30);
        doc.text(splitFire, 22, currentY);
        currentY += splitFire.length * 3 + 2;
      }
    }
  }
  
  // Separator
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.4);
  doc.line(10, currentY, pageWidth - 10, currentY);
  currentY += 4;
  
  // Two column layout
  const leftColX = 10;
  const leftColWidth = 68;
  const rightColX = 84;
  const rightColWidth = pageWidth - rightColX - 8;
  
  const formatValue = (val: number, decimals: number = 1) => {
    if (val < 1) return val.toFixed(decimals + 1);
    if (val < 10) return val.toFixed(decimals);
    if (val < 100) return val.toFixed(decimals);
    return Math.round(val).toLocaleString();
  };
  
  // ===== LEFT COLUMN: Specs =====
  let leftY = currentY;
  
  // Get editable labels from config
  const dutyLabels = config?.duty_point_labels || {};
  const operatingLabels = config?.operating_point_labels || {};
  const constructionLabels = config?.construction_labels || {};
  const motorLabelsConfig = config?.motor_labels || {};
  
  // Duty Point - shows the ORIGINAL requested values (what user asked for)
  if (showDutyPoint) {
    const sectionTitle = config?.section_title_duty_point || 'Duty Point';
    leftY = drawSpecSection(doc, sectionTitle, [
      [dutyLabels.airflow || 'Airflow', `${formatValue(baseDisplayAirflow)} ${AIRFLOW_UNITS[airflowUnit].label}`],
      [dutyLabels.pressure || 'Static Pressure', `${formatValue(baseDisplayPressure)} ${PRESSURE_UNITS[pressureUnit].label}`],
      [dutyLabels.temperature || 'Temperature', `${temperature} °C`],
      [dutyLabels.altitude || 'Altitude', `${altitude} m`],
      [dutyLabels.density || 'Density', `${airDensity} kg/m³`],
    ], leftColX, leftY, leftColWidth);
  }
  
  // Operating Point - shows the ACTUAL operating values (adjusted for VFD/voltage drive)
  if (showOperatingPoint) {
    const sectionTitle = config?.section_title_operating_point || 'Operating Point';
    const showEfficiency = (config as any)?.show_efficiency !== false;
    const operatingItems: [string, string][] = [
      [operatingLabels.airflow || 'Airflow', `${formatValue(displayAirflow)} ${AIRFLOW_UNITS[airflowUnit].label}`],
      [operatingLabels.staticPressure || 'Static Pressure', `${formatValue(displayPressure)} ${PRESSURE_UNITS[pressureUnit].label}`],
      [operatingLabels.dynamicPressure || 'Dynamic Pressure', `${formatValue(displayDynamicPressure)} ${PRESSURE_UNITS[pressureUnit].label}`],
      [operatingLabels.totalPressure || 'Total Pressure', `${formatValue(displayTotalPressure)} ${PRESSURE_UNITS[pressureUnit].label}`],
    ];
    if (showEfficiency) {
      // Static Efficiency = (Airflow × Static Pressure) / (Shaft Power × 1000) × 100
      const staticEfficiency = effectiveOperatingPoint.shaftPower > 0 
        ? (effectiveOperatingPoint.airflow * effectiveOperatingPoint.staticPressure) / (effectiveOperatingPoint.shaftPower * 1000 * 3600) * 100
        : 0;
      
      // Total Efficiency = (Airflow × Total Pressure) / (Shaft Power × 1000) × 100
      // Total Pressure = Static Pressure + Dynamic Pressure (recalculate for adjusted values)
      const adjustedTotalPressure = effectiveOperatingPoint.staticPressure + dynamicPressure;
      const totalEfficiency = effectiveOperatingPoint.shaftPower > 0 
        ? (effectiveOperatingPoint.airflow * adjustedTotalPressure) / (effectiveOperatingPoint.shaftPower * 1000 * 3600) * 100
        : 0;
      
      operatingItems.push(['Static Efficiency', `${staticEfficiency.toFixed(1)}%`]);
      operatingItems.push(['Total Efficiency', `${totalEfficiency.toFixed(1)}%`]);
    }
    operatingItems.push(
      [operatingLabels.shaftPower || 'Shaft Power', `${formatPower(effectiveOperatingPoint.shaftPower)} kW`],
      [operatingLabels.outletVelocity || 'Outlet Velocity', `${outletVelocity.toFixed(1)} m/s`],
      ['Fan Speed', `${fanRPM} rpm`],
      [operatingLabels.sfp || 'SFP', `${sfp.toFixed(2)} W/(l/s)`],
    );
    
    // Add speed control info if active
    if (isSpeedControlActive) {
      if (motorPhase === 3 && vfdEnabled && vfdFrequency !== undefined) {
        operatingItems.push(['VFD Frequency', `${vfdFrequency} Hz`]);
      } else if (motorPhase === 1 && voltageDriveEnabled && driveVoltage !== undefined) {
        operatingItems.push(['Drive Voltage', `${driveVoltage} V`]);
      }
    }
    
    leftY = drawSpecSection(doc, sectionTitle, operatingItems, leftColX, leftY, leftColWidth);
  }
  
  // Performance Comparison Table (when VFD/voltage drive is active)
  if (isSpeedControlActive && baseCurveData?.operatingPoint) {
    leftY += 2;
    const comparisonTitle = motorPhase === 1 ? 'Voltage Drive Comparison' : 'VFD Performance Comparison';
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text(comparisonTitle, leftColX, leftY);
    leftY += 3;
    
    // Calculate values for comparison
    const factor = AIRFLOW_UNITS[airflowUnit].factor;
    const pFactor = PRESSURE_UNITS[pressureUnit].factor;
    
    const baseAirflow = Math.round(baseCurveData.operatingPoint.airflow * factor);
    const basePress = Math.round(baseCurveData.operatingPoint.staticPressure * pFactor);
    const basePower = baseCurveData.operatingPoint.shaftPower;
    
    // Calculate speed ratio and apply fan laws to get adjusted values
    let speedRatio = 1;
    if (motorPhase === 3 && vfdEnabled && vfdFrequency !== undefined) {
      // VFD: frequency ratio
      const baseFreq = 50; // Standard base frequency
      speedRatio = vfdFrequency / baseFreq;
    } else if (motorPhase === 1 && voltageDriveEnabled && driveVoltage !== undefined && nominalVoltage) {
      // Voltage drive: voltage ratio
      speedRatio = driveVoltage / nominalVoltage;
    }
    
    // Apply fan laws: Q ∝ N, P ∝ N², W ∝ N³
    const currentAirflow = Math.round(baseCurveData.operatingPoint.airflow * speedRatio * factor);
    const currentPress = Math.round(baseCurveData.operatingPoint.staticPressure * Math.pow(speedRatio, 2) * pFactor);
    const currentPower = Math.round(baseCurveData.operatingPoint.shaftPower * Math.pow(speedRatio, 3) * 1000) / 1000;
    
    // Calculate percentage changes
    const airflowChange = baseAirflow > 0 ? ((currentAirflow - baseAirflow) / baseAirflow * 100) : 0;
    const pressChange = basePress > 0 ? ((currentPress - basePress) / basePress * 100) : 0;
    const powerChange = basePower > 0 ? ((currentPower - basePower) / basePower * 100) : 0;
    
    const formatChange = (val: number) => val >= 0 ? `+${val.toFixed(0)}%` : `${val.toFixed(0)}%`;
    
    // Draw comparison table
    const tableData = [
      ['Parameter', baseCurveData.label, motorPhase === 1 ? `${driveVoltage}V` : `${vfdFrequency}Hz`, 'Δ'],
      [`Airflow (${AIRFLOW_UNITS[airflowUnit].label})`, baseAirflow.toString(), currentAirflow.toString(), formatChange(airflowChange)],
      [`Pressure (${PRESSURE_UNITS[pressureUnit].label})`, basePress.toString(), currentPress.toString(), formatChange(pressChange)],
      ['Power (kW)', basePower.toFixed(2), currentPower.toFixed(2), formatChange(powerChange)],
    ];
    
    autoTable(doc, {
      startY: leftY,
      head: [tableData[0]],
      body: tableData.slice(1),
      margin: { left: leftColX },
      tableWidth: leftColWidth,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: leftColWidth * 0.4 },
        1: { halign: 'center', cellWidth: leftColWidth * 0.2 },
        2: { halign: 'center', cellWidth: leftColWidth * 0.2, fontStyle: 'bold' },
        3: { halign: 'center', cellWidth: leftColWidth * 0.2 },
      },
    });
    
    leftY = (doc as any).lastAutoTable.finalY + 3;
  }
  
  // Construction
  if (showConstruction) {
    const sectionTitle = config?.section_title_construction || 'Construction';
    const showBladeCount = (config as any)?.show_blade_count !== false;
    const showBladeAngle = (config as any)?.show_blade_angle !== false;
    const constructionItems: [string, string][] = [
      [
        constructionLabels.diameter || 'Diameter',
        options.fanSizeUnit === 'in'
          ? `${Number((selection.diameter / 25.4).toFixed(2))} in`
          : `${selection.diameter} mm`,
      ],
    ];
    if (showBladeCount) {
      constructionItems.push([constructionLabels.blades || 'Blade Count', `${selection.bladeCount}`]);
    }
    if (showBladeAngle) {
      constructionItems.push([constructionLabels.bladeAngle || 'Blade Angle', `${selection.bladeAngle}°`]);
    }
    constructionItems.push([constructionLabels.weight || 'Weight', `${totalWeightVal > 0 ? totalWeightVal.toFixed(1) : '-'} kg`]);
    leftY = drawSpecSection(doc, sectionTitle, constructionItems, leftColX, leftY, leftColWidth);
  }
  
  // Motor Details
  if (showMotorCharacteristics) {
    const sectionTitle = config?.section_title_motor || 'Motor Characteristics';
    const showMotorBrand = config?.show_motor_brand !== false;
    const showMotorEfficiencyClass = config?.show_motor_efficiency_class !== false;
    
    // Helper to check if value is valid (not null, undefined, empty, or "None")
    const isValidValue = (val: any): boolean => val && val !== 'None' && val !== '';
    
    console.log('PDF Generator - Motor config:', { showMotorBrand, showMotorEfficiencyClass });
    
    const motorItems: [string, string][] = [
      [motorLabelsConfig.motorPoles || 'Poles', `${selection.motorPole}P`],
      [motorLabelsConfig.power || 'Power', `${selection.motorRating} kW`],
      [motorLabelsConfig.frequency || 'Frequency', `${selection.frequency} Hz`],
    ];
    
    if (motorSpec) {
      if (isValidValue(motorSpec.voltage)) motorItems.push([motorLabelsConfig.voltage || 'Voltage', `${motorSpec.voltage}V`]);
      if (isValidValue(motorSpec.fullLoadCurrent)) motorItems.push([motorLabelsConfig.fla || 'Full Load Current', `${motorSpec.fullLoadCurrent} A`]);
      if (isValidValue(motorSpec.startingCurrent)) motorItems.push([motorLabelsConfig.lra || 'Starting Current', `${motorSpec.startingCurrent} A`]);
      if (isValidValue(motorSpec.ipRating)) motorItems.push([motorLabelsConfig.ipRating || 'IP Rating', motorSpec.ipRating]);
      if (isValidValue(motorSpec.insulationClass)) motorItems.push([motorLabelsConfig.insulation || 'Insulation', `Class ${motorSpec.insulationClass}`]);
      if (showMotorEfficiencyClass && isValidValue(motorSpec.efficiencyClass)) motorItems.push([motorLabelsConfig.efficiency || 'Efficiency Class', motorSpec.efficiencyClass]);
      if (isValidValue(motorSpec.fireRating)) motorItems.push(['Fire Rating', motorSpec.fireRating]);
      if (showMotorBrand && isValidValue(motorSpec.brandName)) motorItems.push([motorLabelsConfig.brand || 'Brand', motorSpec.brandName]);
      if (isValidValue(motorSpec.motorFrame)) motorItems.push([motorLabelsConfig.frame || 'Frame', motorSpec.motorFrame]);
    }
    
    leftY = drawSpecSection(doc, sectionTitle, motorItems, leftColX, leftY, leftColWidth);
  }
  
  // ===== CERTIFICATIONS SECTION (below Motor Characteristics in left column) =====
  // Get custom certifications from config
  const customCertifications: CustomCertification[] = (config as any)?.custom_certifications || [];
  const certificationOrder: string[] = (config as any)?.certification_order || ['amca', 'fire_rating', 'ce', 'ul', 'iso', 'atex', 'custom'];
  
  const hasCertifications = effectiveAmcaCertified || effectiveFireRating || 
    effectiveCeCertified || effectiveUlCertified || effectiveIsoCertified || effectiveAtexCertified ||
    seriesInfo?.customCertName || customCertifications.length > 0;
  
  if (showCertifications && hasCertifications) {
    leftY += 3; // Small gap after motor section
    
    const certificationsSectionTitle = config?.section_title_certifications || 'Certifications';
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text(certificationsSectionTitle, leftColX, leftY);
    leftY += 6;
    
    const logoHeight = 20; // Increased from 16 for better visibility
    let logoX = leftColX;
    const maxLogoWidth = leftColWidth;
    const logoGap = 5;
    
    // Helper function to render a certification badge/logo
    const renderCertBadge = async (
      logoUrl: string | undefined,
      badgeText: string,
      badgeColor: [number, number, number]
    ) => {
      // Check if we need to wrap to next line
      if (logoX > leftColX + maxLogoWidth - 25) {
        leftY += logoHeight + 4;
        logoX = leftColX;
      }
      
      if (logoUrl) {
        try {
          const logoData = await loadImageAsBase64(logoUrl);
          if (logoData) {
            const aspectRatio = logoData.width / logoData.height;
            const logoWidth = Math.min(logoHeight * aspectRatio, 40);
            doc.addImage(logoData.base64, 'PNG', logoX, leftY, logoWidth, logoHeight, undefined, 'NONE');
            logoX += logoWidth + logoGap;
            return;
          }
        } catch {
          // Fall through to badge fallback
        }
      }
      // Fallback badge
      const badgeWidth = Math.min(Math.max(24, doc.getTextWidth(badgeText) + 12), 40);
      doc.setFillColor(...badgeColor);
      doc.roundedRect(logoX, leftY, badgeWidth, logoHeight, 2, 2, 'F');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(badgeText, logoX + badgeWidth / 2, leftY + logoHeight / 2 + 3, { align: 'center' });
      logoX += badgeWidth + logoGap;
    };
    
    // Render certifications in configured order
    for (const certType of certificationOrder) {
      switch (certType) {
        case 'amca':
          if (effectiveAmcaCertified) {
            await renderCertBadge(effectiveAmcaLogoUrl, 'AMCA', COLORS.primary);
          }
          break;
        case 'fire_rating':
          if (effectiveFireRating) {
            await renderCertBadge(effectiveFireRatingLogoUrl, effectiveFireRating, [220, 38, 38]);
          }
          break;
        case 'ce':
          if (effectiveCeCertified) {
            await renderCertBadge(effectiveCeLogoUrl, 'CE', [0, 102, 153]);
          }
          break;
        case 'ul':
          if (effectiveUlCertified) {
            await renderCertBadge(effectiveUlLogoUrl, 'UL', [153, 0, 0]);
          }
          break;
        case 'iso':
          if (effectiveIsoCertified) {
            await renderCertBadge(effectiveIsoLogoUrl, 'ISO', [0, 128, 0]);
          }
          break;
        case 'atex':
          if (effectiveAtexCertified) {
            await renderCertBadge(effectiveAtexLogoUrl, 'ATEX', [255, 153, 0]);
          }
          break;
        case 'custom':
          // Series custom certification
          if (seriesInfo?.customCertName) {
            await renderCertBadge(seriesInfo.customCertLogoUrl, seriesInfo.customCertName, [100, 100, 120]);
          }
          // Render additional custom certifications from datasheet config
          for (const cert of customCertifications) {
            if (cert.name) {
              await renderCertBadge(cert.logo_url, cert.name, [100, 100, 120]);
            }
          }
          break;
      }
    }
    
    leftY += logoHeight + 6;
  }
  
  // ===== RIGHT COLUMN: Charts (BIGGER) =====
  
  const chartWidth = rightColWidth;
  // Reduce chart height when family curves are enabled to fit all 3 charts with legends on page
  const chartHeight = showFamilyCurve ? 48 : 65; // Family curves need smaller charts to fit all on page
  let chartY = currentY;
  let rightColumnEndY = currentY; // Track where right column content ends
  
  if (showPerformanceCurves) {
  // Get individual curve visibility settings
  const showFanCurve = (config as any)?.show_fan_curve !== false;
  const showPowerCurve = (config as any)?.show_power_curve !== false;
  const showEfficiencyCurve = (config as any)?.show_efficiency_curve !== false;
  
  // Section title - Performance Curves doesn't have a config title, using default
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  const curvesTitle = showFamilyCurve ? 'Performance Curves (Family)' : 'Performance Curves';
  doc.text(curvesTitle, rightColX, chartY);
  chartY += 3;

  // Prepare chart data
  // Include points where airflow is 0 (shut-off point - curve touches Y-axis for centrifugal/mixed flow fans)
  // Include points where pressure is 0 (fan curve touches X-axis at max airflow)
  const pressureData = performanceData
    .filter(p => p.airflow >= 0 && p.staticPressure >= 0 && !(p.airflow === 0 && p.staticPressure === 0))
    .map(p => ({ 
      x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor, 
      y: p.staticPressure * PRESSURE_UNITS[pressureUnit].factor 
    }));
  
  const powerData = performanceData
    .filter(p => p.airflow >= 0 && p.shaftPower > 0)
    .map(p => ({ 
      x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor, 
      y: p.shaftPower 
    }));
  
  // Total efficiency: use stored value, otherwise derive it (static + dynamic pressure)
  const effOf = (p: { airflow: number; staticPressure: number; shaftPower: number; efficiency: number }) =>
    p.efficiency > 0
      ? p.efficiency
      : calculateTotalEfficiency(p.airflow, p.staticPressure, p.shaftPower, selection.diameter, airDensity) ?? 0;

  const efficiencyData = performanceData
    .filter(p => p.airflow >= 0 && effOf(p) > 0)
    .map(p => ({ 
      x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor, 
      y: effOf(p) 
    }));
  
  // Calculate shared X-axis maximum - use exact data max, no padding (matches webpage)
  const allXValues = [...pressureData, ...powerData, ...efficiencyData].map(d => d.x);
  const sharedXMax = Math.max(...allXValues);
  
  // Prepare family curve data for PDF if enabled
  const familyPressureData = showFamilyCurve && familyCurveData ? familyCurveData.map(curve => ({
    angle: curve.angle,
    data: curve.data
      .filter(p => p.airflow >= 0 && p.staticPressure >= 0 && !(p.airflow === 0 && p.staticPressure === 0))
      .map(p => ({
        x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor,
        y: p.staticPressure * PRESSURE_UNITS[pressureUnit].factor
      }))
  })) : [];

  const familyPowerData = showFamilyCurve && familyCurveData ? familyCurveData.map(curve => ({
    angle: curve.angle,
    data: curve.data
      .filter(p => p.airflow >= 0 && p.shaftPower > 0)
      .map(p => ({
        x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor,
        y: p.shaftPower
      }))
  })) : [];

  const familyEfficiencyData = showFamilyCurve && familyCurveData ? familyCurveData.map(curve => ({
    angle: curve.angle,
    data: curve.data
      .filter(p => p.airflow >= 0 && effOf(p) > 0)
      .map(p => ({
        x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor,
        y: effOf(p)
      }))
  })) : [];
  
  // Prepare base curve data for VFD comparison (if provided)
  const basePressureData = baseCurveData?.performanceData
    ? baseCurveData.performanceData
        .filter(p => p.airflow >= 0 && p.staticPressure >= 0 && !(p.airflow === 0 && p.staticPressure === 0))
        .map(p => ({
          x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor,
          y: p.staticPressure * PRESSURE_UNITS[pressureUnit].factor
        }))
    : [];
  
  const basePowerData = baseCurveData?.performanceData
    ? baseCurveData.performanceData
        .filter(p => p.airflow >= 0 && p.shaftPower > 0)
        .map(p => ({
          x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor,
          y: p.shaftPower
        }))
    : [];
  
  const baseEfficiencyData = baseCurveData?.performanceData
    ? baseCurveData.performanceData
        .filter(p => p.airflow >= 0 && effOf(p) > 0)
        .map(p => ({
          x: p.airflow * AIRFLOW_UNITS[airflowUnit].factor,
          y: effOf(p)
        }))
    : [];
  
  const baseOperatingPointPressure = baseCurveData?.operatingPoint
    ? {
        x: baseCurveData.operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor,
        y: baseCurveData.operatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor
      }
    : undefined;
  
  const baseOperatingPointPower = baseCurveData?.operatingPoint
    ? {
        x: baseCurveData.operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor,
        y: baseCurveData.operatingPoint.shaftPower
      }
    : undefined;
  
  const baseOperatingPointEfficiency = baseCurveData?.operatingPoint
    ? {
        x: baseCurveData.operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor,
        y: baseCurveData.operatingPoint.efficiency
      }
    : undefined;
  
  // Recalculate sharedXMax to include base curve data when VFD is active
  const allXValuesWithBase = [
    ...pressureData, ...powerData, ...efficiencyData,
    ...basePressureData, ...basePowerData, ...baseEfficiencyData
  ].map(d => d.x);
  const sharedXMaxWithBase = allXValuesWithBase.length > 0 ? Math.max(...allXValuesWithBase) : sharedXMax;
  
  // Pressure chart - use family curves if enabled, otherwise single curve
  if (showFanCurve) {
    // Add chart title - centered above chart, bold
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const fanCurveTitle = isSpeedControlActive && baseCurveData ? `Fan Curve (${motorPhase === 1 ? 'Voltage' : 'VFD'} Adjusted)` : 'Fan Curve';
    doc.text(fanCurveTitle, rightColX + chartWidth / 2, chartY, { align: 'center' });
    // No gap - chart starts immediately after title
    
    if (showFamilyCurve && familyPressureData.length > 0) {
      // Draw family curves with legend
      const familyChartHeight = chartHeight + 8; // Extra height for legend
      drawFamilyPerformanceCurves(doc, familyPressureData, rightColX, chartY, chartWidth, familyChartHeight, {
        yLabel: PRESSURE_UNITS[pressureUnit].label,
        xLabel: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`,
        dutyPoint: { x: displayAirflow, y: displayPressure },
        selectedAngle: selection.bladeAngle,
        chartType: 'pressure',
      });
      chartY += familyChartHeight + 2;
    } else {
      // Single curve with optional base curve for VFD comparison
      drawPerformanceCurve(doc, pressureData, rightColX, chartY, chartWidth, chartHeight, {
        yLabel: PRESSURE_UNITS[pressureUnit].label,
        xLabel: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`,
        lineColor: COLORS.primary,
        dutyPoint: { x: displayAirflow, y: displayPressure },
        showArea: false,
        sharedXMax: sharedXMaxWithBase,
        showSystemCurve: true,
        stallZone: (stallAirflowMinPercent && stallAirflowMinPercent > 0) ? { 
          minPercent: stallAirflowMinPercent, 
          maxPercent: stallAirflowMaxPercent || 95 
        } : undefined,
        // Pass base curve for VFD comparison
        baseCurve: basePressureData.length > 0 ? {
          data: basePressureData,
          label: baseCurveData?.label || '50Hz',
          dutyPoint: baseOperatingPointPressure,
        } : undefined,
        // Match the selector chart: anchor the system resistance curve to
        // the plotted operating point so it intersects the fan curve and dot.
        systemCurveDutyPoint: { x: displayAirflow, y: displayPressure },
        // Label for adjusted curve (when VFD/voltage is active)
        adjustedCurveLabel: isSpeedControlActive ? adjustedCurveLabel : undefined,
      });
      chartY += chartHeight - 2;
    }
  }
  
  // Power chart (orange) - use family curves if enabled, otherwise single curve
  if (showPowerCurve) {
    // Add spacing before title to separate from previous chart
    chartY += 3;
    
    // Add chart title - centered above chart, bold
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const powerCurveTitle = isSpeedControlActive && baseCurveData ? `Shaft Power (${motorPhase === 1 ? 'Voltage' : 'VFD'} Adjusted)` : 'Shaft Power';
    doc.text(powerCurveTitle, rightColX + chartWidth / 2, chartY, { align: 'center' });
    // No gap - chart starts immediately after title
    
    if (showFamilyCurve && familyPowerData.length > 0) {
      // Draw family curves with legend
      const familyChartHeight = chartHeight + 8;
      drawFamilyPerformanceCurves(doc, familyPowerData, rightColX, chartY, chartWidth, familyChartHeight, {
        yLabel: 'kW',
        xLabel: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`,
        dutyPoint: { x: displayAirflow, y: effectiveOperatingPoint.shaftPower },
        selectedAngle: selection.bladeAngle,
        chartType: 'power',
      });
      chartY += familyChartHeight + 2;
    } else {
      drawPerformanceCurve(doc, powerData, rightColX, chartY, chartWidth, chartHeight, {
        yLabel: 'kW',
        xLabel: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`,
        lineColor: COLORS.secondary,
        dutyPoint: { x: displayAirflow, y: effectiveOperatingPoint.shaftPower },
        showArea: false,
        sharedXMax: sharedXMaxWithBase,
        // Pass base curve for VFD comparison
        baseCurve: basePowerData.length > 0 ? {
          data: basePowerData,
          label: baseCurveData?.label || '50Hz',
          dutyPoint: baseOperatingPointPower,
        } : undefined,
        // Label for adjusted curve (when VFD/voltage is active)
        adjustedCurveLabel: isSpeedControlActive ? adjustedCurveLabel : undefined,
      });
      chartY += chartHeight - 2;
    }
  }
  
  // Efficiency chart (green) - use family curves if enabled, otherwise single curve
  if (showEfficiencyCurve) {
    // Add spacing before title to separate from previous chart
    chartY += 3;
    
    // Add chart title - centered above chart, bold
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const effCurveTitle = isSpeedControlActive && baseCurveData ? `Total Efficiency (${motorPhase === 1 ? 'Voltage' : 'VFD'} Adjusted)` : 'Total Efficiency';
    doc.text(effCurveTitle, rightColX + chartWidth / 2, chartY, { align: 'center' });
    // No gap - chart starts immediately after title
    
    if (showFamilyCurve && familyEfficiencyData.length > 0) {
      // Draw family curves with legend
      const familyChartHeight = chartHeight + 8;
      drawFamilyPerformanceCurves(doc, familyEfficiencyData, rightColX, chartY, chartWidth, familyChartHeight, {
        yLabel: '%',
        xLabel: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`,
        dutyPoint: { x: displayAirflow, y: effOf(effectiveOperatingPoint) },
        selectedAngle: selection.bladeAngle,
        chartType: 'efficiency',
      });
      chartY += familyChartHeight + 2;
    } else {
      drawPerformanceCurve(doc, efficiencyData, rightColX, chartY, chartWidth, chartHeight, {
        yLabel: '%',
        xLabel: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`,
        lineColor: COLORS.success,
        dutyPoint: { x: displayAirflow, y: effOf(effectiveOperatingPoint) },
        showArea: false,
        sharedXMax: sharedXMaxWithBase,
        // Pass base curve for VFD comparison
        baseCurve: baseEfficiencyData.length > 0 ? {
          data: baseEfficiencyData,
          label: baseCurveData?.label || '50Hz',
          dutyPoint: baseOperatingPointEfficiency,
        } : undefined,
        // Label for adjusted curve (when VFD/voltage is active)
        adjustedCurveLabel: isSpeedControlActive ? adjustedCurveLabel : undefined,
      });
      chartY += chartHeight + 2;
    }
  }
  
  rightColumnEndY = chartY;
  } // end showPerformanceCurves
  
  // Certifications section now renders in left column after Motor Characteristics (above)
  
  // ===== DYNAMIC LAYOUT: Check if there's space for noise data on page 1 =====
  // Calculate remaining space on page 1
  const maxContentEndY = Math.max(leftY, rightColumnEndY);
  const remainingSpaceOnPage1 = pageHeight - maxContentEndY - 30; // 30mm for footer and margins
  
  // Determine if we should put noise on page 1
  // Need about 70mm for noise section (chart + table)
  const noiseRequiredHeight = effectiveShowOctaveBands ? 70 : 40;
  const canFitNoiseOnPage1 = showNoiseSection && effectiveNoiseData && remainingSpaceOnPage1 >= noiseRequiredHeight;
  
  // Render noise on page 1 if there's space
  let noiseRenderedOnPage1 = false;
  if (canFitNoiseOnPage1) {
    let noiseY = maxContentEndY + 5;
    
    // Check if we have actual octave band data
    // Check for meaningful octave band data (values > 0, not just defined)
    const hasOctaveBandData = (
      (effectiveNoiseData.hz63 && effectiveNoiseData.hz63 > 0) ||
      (effectiveNoiseData.hz125 && effectiveNoiseData.hz125 > 0) ||
      (effectiveNoiseData.hz250 && effectiveNoiseData.hz250 > 0) ||
      (effectiveNoiseData.hz500 && effectiveNoiseData.hz500 > 0) ||
      (effectiveNoiseData.hz1k && effectiveNoiseData.hz1k > 0) ||
      (effectiveNoiseData.hz2k && effectiveNoiseData.hz2k > 0) ||
      (effectiveNoiseData.hz4k && effectiveNoiseData.hz4k > 0) ||
      (effectiveNoiseData.hz8k && effectiveNoiseData.hz8k > 0)
    );
    
    const shouldShowOctaveBands = effectiveShowOctaveBands && hasOctaveBandData;
    
    if (shouldShowOctaveBands) {
      // Calculate noise at distance for SPL chart
      const noiseAtDist = {
        hz63: calculateNoiseAtDistance(effectiveNoiseData.hz63 || 0, noiseDistance, noiseDirectivityQ),
        hz125: calculateNoiseAtDistance(effectiveNoiseData.hz125 || 0, noiseDistance, noiseDirectivityQ),
        hz250: calculateNoiseAtDistance(effectiveNoiseData.hz250 || 0, noiseDistance, noiseDirectivityQ),
        hz500: calculateNoiseAtDistance(effectiveNoiseData.hz500 || 0, noiseDistance, noiseDirectivityQ),
        hz1k: calculateNoiseAtDistance(effectiveNoiseData.hz1k || 0, noiseDistance, noiseDirectivityQ),
        hz2k: calculateNoiseAtDistance(effectiveNoiseData.hz2k || 0, noiseDistance, noiseDirectivityQ),
        hz4k: calculateNoiseAtDistance(effectiveNoiseData.hz4k || 0, noiseDistance, noiseDirectivityQ),
        hz8k: calculateNoiseAtDistance(effectiveNoiseData.hz8k || 0, noiseDistance, noiseDirectivityQ),
        overall: calculateNoiseAtDistance(effectiveNoiseData.overall || 0, noiseDistance, noiseDirectivityQ),
      };
      
      const ncAtDistance = calculateNCLevel(noiseAtDist);
      const chartWidth = (pageWidth - 24) / 2;
      
      // Left chart: Sound Power Level (LwA) - At Source
      drawNoiseChart(doc, effectiveNoiseData, 10, noiseY, chartWidth, 50, 'Sound Power Level (LwA)', 'At Source');
      
      // Right chart: Sound Pressure Level (LpA) - At Distance
      drawNoiseChart(doc, noiseAtDist, 10 + chartWidth + 4, noiseY, chartWidth, 50, 'Sound Pressure Level (LpA)', `At ${noiseDistance}m, Q=${noiseDirectivityQ}`);
      
      // Full octave band data table below charts
      autoTable(doc, {
        startY: noiseY + 52,
        margin: { left: 10, right: 10 },
        head: [['Frequency', '63 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz', 'Overall', 'NC']],
        body: [
          ['Source (LwA)', 
            effectiveNoiseData.hz63?.toFixed(0) || '-',
            effectiveNoiseData.hz125?.toFixed(0) || '-',
            effectiveNoiseData.hz250?.toFixed(0) || '-',
            effectiveNoiseData.hz500?.toFixed(0) || '-',
            effectiveNoiseData.hz1k?.toFixed(0) || '-',
            effectiveNoiseData.hz2k?.toFixed(0) || '-',
            effectiveNoiseData.hz4k?.toFixed(0) || '-',
            effectiveNoiseData.hz8k?.toFixed(0) || '-',
            `${effectiveNoiseData.overall?.toFixed(1) || '-'} dB(A)`,
            `NC-${calculateNCLevel(effectiveNoiseData).level}`
          ],
          [`At ${noiseDistance}m, Q=${noiseDirectivityQ} (LpA)`,
            noiseAtDist.hz63.toFixed(0),
            noiseAtDist.hz125.toFixed(0),
            noiseAtDist.hz250.toFixed(0),
            noiseAtDist.hz500.toFixed(0),
            noiseAtDist.hz1k.toFixed(0),
            noiseAtDist.hz2k.toFixed(0),
            noiseAtDist.hz4k.toFixed(0),
            noiseAtDist.hz8k.toFixed(0),
            `${noiseAtDist.overall.toFixed(1)} dB(A)`,
            `NC-${ncAtDistance.level}`
          ],
        ],
        theme: 'striped',
        styles: { fontSize: 6, cellPadding: 1.5, halign: 'center' },
        headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 5.5 },
      });
      
      const tableEndY = (doc as any).lastAutoTable?.finalY || noiseY + 75;
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...COLORS.textLight);
      doc.text(`NC-${ncAtDistance.level}: ${ncAtDistance.description}. Sound data is calculated and should be used as guideline only.`, 10, tableEndY + 3);
      
      noiseRenderedOnPage1 = true;
    } else if (effectiveNoiseData.overall !== undefined && effectiveNoiseData.overall !== null) {
      // Compact noise display on page 1 - simplified when no octave bands
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.text);
      const compactNoiseTitle = config?.section_title_noise || 'Sound Data';
      doc.text(compactNoiseTitle, 10, noiseY + 6);
      
      if (hasOctaveBandData) {
        // Has octave bands - show with distance calculations
        const overallAtDist = calculateNoiseAtDistance(effectiveNoiseData.overall || 0, noiseDistance, noiseDirectivityQ);
        const ncAtDistance = calculateNCLevel({
          hz63: effectiveNoiseData.hz63,
          hz125: effectiveNoiseData.hz125,
          hz250: effectiveNoiseData.hz250,
          hz500: effectiveNoiseData.hz500,
          hz1k: effectiveNoiseData.hz1k,
          hz2k: effectiveNoiseData.hz2k,
          hz4k: effectiveNoiseData.hz4k,
          hz8k: effectiveNoiseData.hz8k,
          overall: effectiveNoiseData.overall,
        });
        
        autoTable(doc, {
          startY: noiseY + 10,
          margin: { left: 10, right: pageWidth / 2 },
          head: [['Parameter', 'Source', `At ${noiseDistance}m`]],
          body: [
            ['Overall Sound Level', `${effectiveNoiseData.overall?.toFixed(1) || '-'} dB(A)`, `${overallAtDist.toFixed(1)} dB(A)`],
            ['NC Rating', '-', `NC-${ncAtDistance.level}`],
          ],
          theme: 'striped',
          styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
          headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255] },
        });
        
        const tableEndY = (doc as any).lastAutoTable?.finalY || noiseY + 30;
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...COLORS.textLight);
        doc.text('Sound data is calculated and should be used as guideline only.', 10, tableEndY + 4);
      } else {
        // No octave bands - calculate noise at distance and estimate NC from that value
        const overallAtSource = effectiveNoiseData.overall || 0;
        const overallAtDist = calculateNoiseAtDistance(overallAtSource, noiseDistance, noiseDirectivityQ);
        const estimatedNC = calculateNCLevel({ overall: overallAtDist });
        
        // When distance is 0, show single column; otherwise show source + distance
        const distanceLabel = noiseDistance === 0 ? 'At Source' : `At ${noiseDistance}m`;
        const showBothColumns = noiseDistance > 0;
        
        autoTable(doc, {
          startY: noiseY + 10,
          margin: { left: 10, right: pageWidth / 2 },
          head: [showBothColumns ? ['Parameter', 'At Source', distanceLabel] : ['Parameter', 'Value']],
          body: showBothColumns ? [
            ['Overall Sound Level', `${overallAtSource.toFixed(1)} dB(A)`, `${overallAtDist.toFixed(1)} dB(A)`],
            ['Estimated NC Rating', '-', `NC-${estimatedNC.level}`],
          ] : [
            ['Overall Sound Level', `${overallAtSource.toFixed(1)} dB(A)`],
            ['Estimated NC Rating', `NC-${estimatedNC.level}`],
          ],
          theme: 'striped',
          styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
          headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255] },
        });
        
        const tableEndY = (doc as any).lastAutoTable?.finalY || noiseY + 30;
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...COLORS.textLight);
        doc.text(showBothColumns ? 'NC rating estimated from overall value at distance.' : 'NC rating estimated from overall value.', 10, tableEndY + 4);
      }
      
      noiseRenderedOnPage1 = true;
    }
  }
  
  // Standard reference notes above footer on page 1 (editable)
  if (showStandardNotes) {
    const notesY = pageHeight - 18;
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.textLight);
    
    const standardNotesText = config?.standard_notes_text || 'Selections are based on standard air density of 1.2 kg/m³. Performance tested per ISO 5801 / AMCA 210.';
    const noteLines = doc.splitTextToSize(standardNotesText, pageWidth - 20);
    doc.text(noteLines, 10, notesY);
  }
  
  // Footer
  const footerY = pageHeight - 7;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);
  
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.setFont('helvetica', 'normal');
  
  const contactInfo = database.contactInfo;
  const footerItems = [
    contactInfo?.phone ? `Tel: ${contactInfo.phone}` : null,
    contactInfo?.email,
  ].filter(Boolean);
  
  doc.text(footerItems.join(' | ') || database.companyName, 10, footerY);
  
  // Date-based revision format: Rev YYYY-MM-DD
  const revisionDate = new Date().toISOString().split('T')[0];
  doc.text(`Rev ${revisionDate}`, pageWidth / 2, footerY, { align: 'center' });
  const page1Text = pageLabel ? `${pageLabel} (1/${totalDatasheetPages})` : `Page 1/${totalDatasheetPages}`;
  doc.text(page1Text, pageWidth - 10, footerY, { align: 'right' });
  
  // ===== PAGE 2 =====
  doc.addPage();
  
  // Header bar - WHITE color
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 26, 'F');
  
  // Border line at bottom of header
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(0, 26, pageWidth, 26);
  
  // Logo on white header
  if (database.logoUrl) {
    try {
      const logoData = await loadImageAsBase64(database.logoUrl);
      if (logoData) {
        doc.addImage(logoData.base64, 'PNG', 6, 4, 40, 18);
      }
    } catch {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.primary);
      doc.text(database.companyName || 'Fan Selector', 21, 13, { align: 'center' });
    }
  } else {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(database.companyName || 'Fan Selector', 21, 13, { align: 'center' });
  }
  
  // Technical Datasheet title on page 2 - centered bold (editable)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text(headerTitle, pageWidth / 2, 14, { align: 'center' });
  
  // Series photo on page 2 header - same as page 1
  if (seriesInfo?.imageUrl) {
    try {
      const seriesImageData = await loadImageAsBase64(seriesInfo.imageUrl);
      if (seriesImageData) {
        const format = seriesImageData.base64.includes('image/png') ? 'PNG' : 'JPEG';
        const maxSize = 24;
        const aspectRatio = seriesImageData.width / seriesImageData.height;
        let imgWidth = maxSize;
        let imgHeight = maxSize;
        if (aspectRatio > 1) {
          imgHeight = maxSize / aspectRatio;
        } else {
          imgWidth = maxSize * aspectRatio;
        }
        const imgY = 1 + (maxSize - imgHeight) / 2;
        const imgX = pageWidth - 4 - imgWidth;
        doc.addImage(seriesImageData.base64, format, imgX, imgY, imgWidth, imgHeight, undefined, 'NONE');
      }
    } catch {
      // Silently fail if series image can't be loaded
    }
  }

  // Model name on page 2 (below header)
  currentY = 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.text(`Model : ${selection.nomenclature}`, 10, currentY);
  currentY += 6;
  
  // Noise section - only render on page 2 if not already rendered on page 1
  
  if (showNoiseSection && effectiveNoiseData && !noiseRenderedOnPage1) {
    // Check if we have actual octave band data (not just overall)
    // Check for meaningful octave band data (values >= 10 dB, not just placeholders)
    const octaveBands = [
      effectiveNoiseData.hz63 || 0,
      effectiveNoiseData.hz125 || 0,
      effectiveNoiseData.hz250 || 0,
      effectiveNoiseData.hz500 || 0,
      effectiveNoiseData.hz1k || 0,
      effectiveNoiseData.hz2k || 0,
      effectiveNoiseData.hz4k || 0,
      effectiveNoiseData.hz8k || 0,
    ];
    const hasOctaveBandData = octaveBands.some(v => v >= 10);
    
    // Show octave bands only if enabled in admin AND data exists
    const shouldShowOctaveBands = effectiveShowOctaveBands && hasOctaveBandData;
    
    if (shouldShowOctaveBands) {
      // Calculate noise at distance for SPL chart
      const noiseAtDist = {
        hz63: calculateNoiseAtDistance(effectiveNoiseData.hz63 || 0, noiseDistance, noiseDirectivityQ),
        hz125: calculateNoiseAtDistance(effectiveNoiseData.hz125 || 0, noiseDistance, noiseDirectivityQ),
        hz250: calculateNoiseAtDistance(effectiveNoiseData.hz250 || 0, noiseDistance, noiseDirectivityQ),
        hz500: calculateNoiseAtDistance(effectiveNoiseData.hz500 || 0, noiseDistance, noiseDirectivityQ),
        hz1k: calculateNoiseAtDistance(effectiveNoiseData.hz1k || 0, noiseDistance, noiseDirectivityQ),
        hz2k: calculateNoiseAtDistance(effectiveNoiseData.hz2k || 0, noiseDistance, noiseDirectivityQ),
        hz4k: calculateNoiseAtDistance(effectiveNoiseData.hz4k || 0, noiseDistance, noiseDirectivityQ),
        hz8k: calculateNoiseAtDistance(effectiveNoiseData.hz8k || 0, noiseDistance, noiseDirectivityQ),
        overall: calculateNoiseAtDistance(effectiveNoiseData.overall || 0, noiseDistance, noiseDirectivityQ),
      };
      
      const ncAtDistance = calculateNCLevel(noiseAtDist);
      const noiseChartWidth = (pageWidth - 24) / 2;
      
      // Left chart: Sound Power Level (LwA) - At Source
      drawNoiseChart(doc, effectiveNoiseData, 10, currentY, noiseChartWidth, 50, 'Sound Power Level (LwA)', 'At Source');
      
      // Right chart: Sound Pressure Level (LpA) - At Distance
      drawNoiseChart(doc, noiseAtDist, 10 + noiseChartWidth + 4, currentY, noiseChartWidth, 50, 'Sound Pressure Level (LpA)', `At ${noiseDistance}m, Q=${noiseDirectivityQ}`);
      
      // Full octave band data table below charts
      autoTable(doc, {
        startY: currentY + 52,
        margin: { left: 10, right: 10 },
        head: [['Frequency', '63 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz', 'Overall', 'NC']],
        body: [
          ['Source (LwA)', 
            effectiveNoiseData.hz63?.toFixed(0) || '-',
            effectiveNoiseData.hz125?.toFixed(0) || '-',
            effectiveNoiseData.hz250?.toFixed(0) || '-',
            effectiveNoiseData.hz500?.toFixed(0) || '-',
            effectiveNoiseData.hz1k?.toFixed(0) || '-',
            effectiveNoiseData.hz2k?.toFixed(0) || '-',
            effectiveNoiseData.hz4k?.toFixed(0) || '-',
            effectiveNoiseData.hz8k?.toFixed(0) || '-',
            `${effectiveNoiseData.overall?.toFixed(1) || '-'} dB(A)`,
            `NC-${calculateNCLevel(effectiveNoiseData).level}`
          ],
          [`At ${noiseDistance}m, Q=${noiseDirectivityQ} (LpA)`,
            noiseAtDist.hz63.toFixed(0),
            noiseAtDist.hz125.toFixed(0),
            noiseAtDist.hz250.toFixed(0),
            noiseAtDist.hz500.toFixed(0),
            noiseAtDist.hz1k.toFixed(0),
            noiseAtDist.hz2k.toFixed(0),
            noiseAtDist.hz4k.toFixed(0),
            noiseAtDist.hz8k.toFixed(0),
            `${noiseAtDist.overall.toFixed(1)} dB(A)`,
            `NC-${ncAtDistance.level}`
          ],
        ],
        theme: 'striped',
        styles: { fontSize: 6, cellPadding: 1.5, halign: 'center' },
        headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 5.5 },
      });
      
      const tableEndY = (doc as any).lastAutoTable?.finalY || currentY + 75;
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...COLORS.textLight);
      doc.text(`NC-${ncAtDistance.level}: ${ncAtDistance.description}. Sound data is calculated and should be used as guideline only.`, 10, tableEndY + 3);
      
      currentY = tableEndY + 10;
    } else if (effectiveNoiseData.overall !== undefined && effectiveNoiseData.overall !== null) {
      // Show only overall noise level (compact display) - either by admin choice OR when no octave data exists
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.text);
      const compactNoiseTitle = config?.section_title_noise || 'Sound Data';
      doc.text(compactNoiseTitle, 10, currentY + 6);
      
      if (hasOctaveBandData) {
        // Has octave bands - show with distance calculations
        const overallAtDist = calculateNoiseAtDistance(effectiveNoiseData.overall || 0, noiseDistance, noiseDirectivityQ);
        const ncAtDistance = calculateNCLevel({
          hz63: effectiveNoiseData.hz63,
          hz125: effectiveNoiseData.hz125,
          hz250: effectiveNoiseData.hz250,
          hz500: effectiveNoiseData.hz500,
          hz1k: effectiveNoiseData.hz1k,
          hz2k: effectiveNoiseData.hz2k,
          hz4k: effectiveNoiseData.hz4k,
          hz8k: effectiveNoiseData.hz8k,
          overall: effectiveNoiseData.overall,
        });
        
        autoTable(doc, {
          startY: currentY + 10,
          margin: { left: 10, right: pageWidth / 2 },
          head: [['Parameter', 'Source', `At ${noiseDistance}m`]],
          body: [
            ['Overall Sound Level', `${effectiveNoiseData.overall?.toFixed(1) || '-'} dB(A)`, `${overallAtDist.toFixed(1)} dB(A)`],
            ['NC Rating', '-', `NC-${ncAtDistance.level}`],
          ],
          theme: 'striped',
          styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
          headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255] },
        });
        
        const tableEndY = (doc as any).lastAutoTable?.finalY || currentY + 30;
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...COLORS.textLight);
        doc.text(`NC-${ncAtDistance.level}: ${ncAtDistance.description}`, 10, tableEndY + 4);
        
        doc.setFontSize(5.5);
        doc.text('Sound data is calculated and should be used as guideline only.', 10, tableEndY + 9);
        
        currentY = tableEndY + 16;
      } else {
        // No octave bands - calculate noise at distance and estimate NC from that value
        const overallAtSource = effectiveNoiseData.overall || 0;
        const overallAtDist = calculateNoiseAtDistance(overallAtSource, noiseDistance, noiseDirectivityQ);
        const estimatedNC = calculateNCLevel({ overall: overallAtDist });
        
        // When distance is 0, show single column; otherwise show source + distance
        const distanceLabel = noiseDistance === 0 ? 'At Source' : `At ${noiseDistance}m`;
        const showBothColumns = noiseDistance > 0;
        
        autoTable(doc, {
          startY: currentY + 10,
          margin: { left: 10, right: pageWidth / 2 },
          head: [showBothColumns ? ['Parameter', 'At Source', distanceLabel] : ['Parameter', 'Value']],
          body: showBothColumns ? [
            ['Overall Sound Level', `${overallAtSource.toFixed(1)} dB(A)`, `${overallAtDist.toFixed(1)} dB(A)`],
            ['Estimated NC Rating', '-', `NC-${estimatedNC.level}`],
          ] : [
            ['Overall Sound Level', `${overallAtSource.toFixed(1)} dB(A)`],
            ['Estimated NC Rating', `NC-${estimatedNC.level}`],
          ],
          theme: 'striped',
          styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
          headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255] },
        });
        
        const tableEndY = (doc as any).lastAutoTable?.finalY || currentY + 30;
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...COLORS.textLight);
        doc.text(showBothColumns ? 'NC rating estimated from overall value at distance.' : 'NC rating estimated from overall value.', 10, tableEndY + 4);
        
        currentY = tableEndY + 11;
      }
    }
    // If no noise data at all, skip the section entirely
  }
  
  // Technical Drawing section on same page
  if (showTechnicalDrawing) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Technical Drawing', 10, currentY); // Drawing section - no config title needed
  
  const drawingY = currentY + 5;
  const drawingHeight = 90; // Larger for better quality
  const drawingWidth = (pageWidth - 20) * 0.85; // 85% of page width for better quality
  
  // Center the drawing
  const drawingX = (pageWidth - drawingWidth) / 2;
  
  // Load and draw the technical drawing
  const drawingLoaded = await drawFanDrawingFromImage(
    doc, seriesDrawingUrl,
    drawingX, drawingY, drawingWidth, drawingHeight
  );
  if (!drawingLoaded) {
    drawDrawingPlaceholder(doc, selection.diameter, drawingX, drawingY, drawingWidth, drawingHeight);
  }
  
  currentY = drawingY + drawingHeight + 8;
  } // end showTechnicalDrawing
  
  // Dimensions table below drawing
  const dimTableY = currentY;
  
  // Get flexible dimensions from options
  const flexSchema = options.flexibleDimensionSchema;
  const flexValue = options.flexibleDimensionValue;
  
  if (showDimensionsTable) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  const dimensionsSectionTitle = config?.section_title_dimensions || 'Dimensions';
  doc.text(`${dimensionsSectionTitle} (mm)`, 10, dimTableY);
  
  // Use flexible dimensions if available, otherwise fall back to fixed dimensions
  if (flexSchema && flexSchema.length > 0 && flexValue) {
    // Build dynamic header from schema (sorted by display_order)
    const sortedSchema = [...flexSchema].sort((a, b) => a.display_order - b.display_order);
    const headers = ['Size', ...sortedSchema.map(p => p.param_label)];
    
    // Build data row from values
    const dataRow = [
      flexValue.size?.toString() || selection.diameter.toString(),
      ...sortedSchema.map(p => {
        const val = flexValue.values[p.param_key];
        return val !== undefined && val !== null && val !== '' ? val.toString() : '-';
      })
    ];
    
    autoTable(doc, {
      startY: dimTableY + 4,
      margin: { left: 10, right: 10 },
      head: [headers],
      body: [dataRow],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: 'bold' },
    });
  } else if (fanDimensions) {
    // Fall back to old fixed dimensions system
    autoTable(doc, {
      startY: dimTableY + 4,
      margin: { left: 10, right: 10 },
      head: [['Size', 'ΦD', 'ΦD1', 'ΦD2', 'H', 'E', 'F', 'L', 'K', 'n-Φd', 'z-Φd1', 'Motor Max']],
      body: [[
        fanDimensions.size?.toString() || selection.diameter.toString(),
        fanDimensions.phiD?.toString() || '-',
        fanDimensions.phiD1?.toString() || '-',
        fanDimensions.phiD2?.toString() || '-',
        fanDimensions.H?.toString() || '-',
        fanDimensions.E?.toString() || '-',
        fanDimensions.F?.toString() || '-',
        fanDimensions.L?.toString() || '-',
        fanDimensions.K?.toString() || '-',
        fanDimensions.nPhiD || '-',
        fanDimensions.zPhiD1 || '-',
        fanDimensions.motorMax || '-',
      ]],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: 'bold' },
    });
  } else {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLight);
    doc.text('Dimensions not available for this size', pageWidth / 2, dimTableY + 10, { align: 'center' });
  }
  } // end showDimensionsTable
  
  // Custom notes from config
  if (config?.custom_notes) {
    const customNotesY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : dimTableY + 30;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text('Notes:', 10, customNotesY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const splitNotes = doc.splitTextToSize(config.custom_notes, pageWidth - 20);
    doc.text(splitNotes, 10, customNotesY + 5);
  }
  
  // VFD Features from config
  if (config?.show_vfd_features && config?.vfd_features_content) {
    const vfdY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : dimTableY + 45;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text('VFD Features:', 10, vfdY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const splitVfd = doc.splitTextToSize(config.vfd_features_content, pageWidth - 20);
    doc.text(splitVfd, 10, vfdY + 5);
  }
  
  // Custom sections from config
  if (config?.custom_sections && config.custom_sections.length > 0) {
    let customY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 25 : dimTableY + 55;
    for (const section of config.custom_sections) {
      if (section.title && section.content) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.text);
        doc.text(section.title, 10, customY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const splitContent = doc.splitTextToSize(section.content, pageWidth - 20);
        doc.text(splitContent, 10, customY + 5);
        customY += splitContent.length * 4 + 10;
      }
    }
  }
  
  // Compatible Accessories section (if any)
  if (compatibleAccessories && compatibleAccessories.length > 0) {
    let accessoriesY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : dimTableY + 35;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text('Compatible Accessories:', 10, accessoriesY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLight);
    
    // Build accessory list with descriptions
    const accessoryLines = compatibleAccessories.map(code => {
      const desc = accessoryDescriptions[code];
      return desc ? `• ${code}: ${desc}` : `• ${code}`;
    });
    
    accessoriesY += 4;
    for (const line of accessoryLines) {
      doc.text(line, 12, accessoriesY);
      accessoriesY += 4;
    }
  }
  
  // QR Codes for IOM Manual and Catalogue (if URLs provided and enabled in config)
  const qrSize = 18;
  const qrY = footerY - 26;
  
  // Get URLs from both options and seriesInfo (fallback)
  const effectiveCatalogueUrl = (seriesInfo as any)?.catalogueUrl;
  const effectiveIomUrl = iomUrl || (seriesInfo as any)?.iomUrl;
  
  // Check config for QR visibility (default to true if not set)
  const showCatalogueQr = config?.show_catalogue_qr !== false;
  const showIomQr = config?.show_iom_qr !== false;
  
  console.log('PDF Generator - QR Code URLs:', {
    catalogueUrl: effectiveCatalogueUrl,
    iomUrl: effectiveIomUrl,
    showCatalogueQr,
    showIomQr,
    seriesInfoFound: !!seriesInfo,
    seriesName: seriesInfo?.name,
  });
  
  // Catalogue QR Code (left position)
  if (effectiveCatalogueUrl && showCatalogueQr) {
    try {
      const qrDataUrl = await generateQRCode(effectiveCatalogueUrl);
      if (qrDataUrl) {
        const qrX = pageWidth - 10 - qrSize - (effectiveIomUrl && showIomQr ? qrSize + 8 : 0);
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        doc.setFontSize(5);
        doc.setTextColor(...COLORS.textLight);
        doc.text('Catalogue', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });
      }
    } catch (e) {
      console.error('PDF Generator - Catalogue QR generation failed:', e);
    }
  }
  
  // IOM Manual QR Code (right position)
  if (effectiveIomUrl && showIomQr) {
    try {
      const qrDataUrl = await generateQRCode(effectiveIomUrl);
      if (qrDataUrl) {
        const qrX = pageWidth - 10 - qrSize;
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        doc.setFontSize(5);
        doc.setTextColor(...COLORS.textLight);
        doc.text('IOM Manual', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });
      }
    } catch (e) {
      console.error('PDF Generator - IOM QR generation failed:', e);
    }
  }
  
  // Page 2 footer
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);
  
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.setFont('helvetica', 'normal');
  doc.text(footerItems.join(' | ') || database.companyName, 10, footerY);
  doc.text(`Rev ${revisionDate}`, pageWidth / 2, footerY, { align: 'center' });
  // Page numbering - use pageLabel if in project mode, otherwise standard 2/3
  const pageNumText = pageLabel ? `${pageLabel} (2/${totalDatasheetPages})` : `Page 2/${totalDatasheetPages}`;
  doc.text(pageNumText, pageWidth - 10, footerY, { align: 'right' });

  if (hasActivatedMultiFanSystem) {
  // ===== PAGE 3 - ACTUAL-MODEL MULTI-FAN AIRFLOW DIGITAL TWIN =====
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(0, 26, pageWidth, 26);

  if (database.logoUrl) {
    try {
      const logoData = await loadImageAsBase64(database.logoUrl);
      if (logoData) doc.addImage(logoData.base64, 'PNG', 6, 4, 40, 18);
    } catch {}
  } else {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(database.companyName || 'Fan Selector', 21, 13, { align: 'center' });
  }

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Technical Datasheet', pageWidth / 2, 14, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textLight);
  doc.text(`${selection.nomenclature} | ${seriesName}`, pageWidth / 2, 20, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.text);
  doc.text('Actual-model Fan Airflow Digital Twin', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text('Engineering airflow direction: inlet -> selected fan -> uniform outlet discharge', 10, 41);

  const fanDiameterM = selection.diameter / 1000;
  const fanAreaM2 = Math.PI * Math.pow(fanDiameterM / 2, 2);
  const flowM3s = selection.operatingPoint.airflow / 3600;
  const tipSpeed = Math.PI * fanDiameterM * fanRPM / 60;
  const specificFanPower = flowM3s > 0 ? selection.operatingPoint.shaftPower * 1000 / flowM3s : 0;
  const airPower = totalPressure * flowM3s / 1000;
  const selectedAirflow = selection.operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor;
  const selectedStaticPressure = selection.operatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor;
  const selectedDynamicPressure = dynamicPressure * PRESSURE_UNITS[pressureUnit].factor;
  const selectedTotalPressure = totalPressure * PRESSURE_UNITS[pressureUnit].factor;
  const operatingStatus = selection.dutyPointMatch >= 95 ? 'PASS' : 'CHECK';

  const twinY = 49;
  const twinH = 86;
  doc.setFillColor(241, 249, 252);
  doc.roundedRect(10, twinY, pageWidth - 20, twinH, 3, 3, 'F');
  doc.setDrawColor(205, 218, 230);
  doc.setLineWidth(0.35);
  doc.roundedRect(10, twinY, pageWidth - 20, twinH, 3, 3);

  // Inlet air field - lighter cyan.
  doc.setFillColor(214, 247, 252);
  doc.rect(15, twinY + 8, 58, twinH - 16, 'F');
  // Outlet air field - stronger blue and the same height for uniform discharge.
  doc.setFillColor(205, 226, 252);
  doc.rect(pageWidth - 73, twinY + 8, 58, twinH - 16, 'F');

  const strandYs = [twinY + 20, twinY + 31, twinY + 42, twinY + 53, twinY + 64];
  strandYs.forEach((strandY, index) => {
    doc.setDrawColor(35, 190, 215);
    doc.setLineWidth(0.65);
    doc.line(19, strandY, 70, strandY);
    doc.setFillColor(35, 190, 215);
    doc.triangle(70, strandY, 66.5, strandY - 1.8, 66.5, strandY + 1.8, 'F');

    doc.setDrawColor(55, 125 + index * 5, 225);
    doc.setLineWidth(0.8);
    doc.line(pageWidth - 70, strandY, pageWidth - 19, strandY);
    doc.setFillColor(55, 125 + index * 5, 225);
    doc.triangle(pageWidth - 19, strandY, pageWidth - 22.5, strandY - 1.8, pageWidth - 22.5, strandY + 1.8, 'F');
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 120, 145);
  doc.text('INLET AIR', 44, twinY + 5, { align: 'center' });
  doc.setTextColor(35, 95, 185);
  doc.text('OUTLET AIR', pageWidth - 44, twinY + 5, { align: 'center' });

  // A dedicated centre product box keeps the selected photo clear of both air fields.
  const productX = 75;
  const productW = pageWidth - 150;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(productX, twinY + 5, productW, twinH - 10, 2, 2, 'F');
  doc.setDrawColor(185, 195, 205);
  doc.roundedRect(productX, twinY + 5, productW, twinH - 10, 2, 2);
  const selectedProductUrl = seriesInfo?.imageUrl || options.seriesImageUrl;
  if (selectedProductUrl) {
    const productData = await loadImageAsBase64(selectedProductUrl);
    if (productData) {
      const productFormat = productData.base64.includes('image/png') ? 'PNG' : 'JPEG';
      const ratio = Math.min((productW - 8) / productData.width, 49 / productData.height);
      const productImgW = productData.width * ratio;
      const productImgH = productData.height * ratio;
      doc.addImage(
        productData.base64,
        productFormat,
        productX + (productW - productImgW) / 2,
        twinY + 14 + (49 - productImgH) / 2,
        productImgW,
        productImgH,
        undefined,
        'NONE',
      );
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.text);
  doc.text(selection.nomenclature, pageWidth / 2, twinY + twinH - 10, { align: 'center', maxWidth: productW - 4 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...COLORS.textLight);
  doc.text(`Inlet -> Ø${selection.diameter} mm fan -> Outlet`, pageWidth / 2, twinY + twinH - 6, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.text('Airflow and pressure intelligence', 10, 146);
  autoTable(doc, {
    startY: 149,
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.6, lineColor: COLORS.border, textColor: COLORS.text },
    head: [['Metric', 'Value', 'Metric', 'Value']],
    body: [
      ['Airflow', `${selectedAirflow < 100 ? selectedAirflow.toFixed(1) : Math.round(selectedAirflow)} ${AIRFLOW_UNITS[airflowUnit].label}`, 'Outlet velocity', `${outletVelocity.toFixed(2)} m/s`],
      ['Static pressure', `${selectedStaticPressure.toFixed(1)} ${PRESSURE_UNITS[pressureUnit].label}`, 'Velocity pressure', `${selectedDynamicPressure.toFixed(1)} ${PRESSURE_UNITS[pressureUnit].label}`],
      ['Total pressure', `${selectedTotalPressure.toFixed(1)} ${PRESSURE_UNITS[pressureUnit].label}`, 'Duct area', `${fanAreaM2.toFixed(3)} m2`],
      ['Fan speed', `${fanRPM} RPM`, 'Tip speed', `${tipSpeed.toFixed(1)} m/s`],
      ['Specific fan power', `${specificFanPower.toFixed(0)} W/(m3/s)`, 'Air power', `${airPower.toFixed(2)} kW`],
      ['Efficiency', `${selection.operatingPoint.efficiency}%`, 'Duty point match', `${selection.dutyPointMatch.toFixed(1)}% - ${operatingStatus}`],
    ],
    margin: { left: 10, right: 10 },
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.text('Engineering checks', 10, 201);
  autoTable(doc, {
    startY: 204,
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.6, lineColor: COLORS.border, textColor: COLORS.text },
    head: [['Air path', 'Selected size', 'Operating point', 'Result']],
    body: [[
      'Inlet -> Fan -> Outlet',
      `Ø${selection.diameter} mm`,
      `${selection.operatingPoint.airflow.toFixed(0)} m3/h @ ${selection.operatingPoint.staticPressure.toFixed(0)} Pa`,
      operatingStatus,
    ]],
    margin: { left: 10, right: 10 },
  });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(
    'Airflow colours identify inlet and outlet zones. Values use the selected catalogue operating point and calculated fan outlet area.',
    10,
    pageHeight - 14,
    { maxWidth: pageWidth - 20 },
  );

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.setFont('helvetica', 'normal');
  doc.text(footerItems.join(' | ') || database.companyName, 10, footerY);
  doc.text(`Rev ${revisionDate}`, pageWidth / 2, footerY, { align: 'center' });
  const page3Text = pageLabel ? `${pageLabel} (3/${totalDatasheetPages})` : `Page 3/${totalDatasheetPages}`;
  doc.text(page3Text, pageWidth - 10, footerY, { align: 'right' });

  if (hasActivatedMultiFanSystem) {
    const isParallelSystem = multiFanArrangement === 'parallel';
    const combinedFlowCmh = selection.operatingPoint.airflow * (isParallelSystem ? multiFanQuantity : 1);
    const combinedStaticPa = selection.operatingPoint.staticPressure * (isParallelSystem ? 1 : multiFanQuantity);
    const combinedTotalPa = totalPressure * (isParallelSystem ? 1 : multiFanQuantity);
    const combinedPowerKw = selection.operatingPoint.shaftPower * multiFanQuantity;
    const sourceNoise = selection.noiseData?.overall || 0;
    const combinedNoise = sourceNoise > 0 ? sourceNoise + 10 * Math.log10(multiFanQuantity) : 0;
    const combinedAreaM2 = fanAreaM2 * (isParallelSystem ? multiFanQuantity : 1);
    const arrangementTitle = isParallelSystem ? 'Parallel Fan System' : 'Series Fan System';
    const lawText = isParallelSystem
      ? `Qtotal = ${multiFanQuantity} x Qfan; pressure = one-fan pressure`
      : `Pressure total = ${multiFanQuantity} x fan pressure; airflow = one-fan airflow`;

    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(0, 26, pageWidth, 26);

    if (database.logoUrl) {
      try {
        const logoData = await loadImageAsBase64(database.logoUrl);
        if (logoData) doc.addImage(logoData.base64, 'PNG', 6, 4, 40, 18);
      } catch {}
    }
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text('Combined Fan System Datasheet', pageWidth / 2, 14, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    doc.text(`${selection.nomenclature} | ${multiFanQuantity} identical fans | ${multiFanArrangement}`, pageWidth / 2, 20, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.text);
    doc.text(arrangementTitle, 10, 35);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textLight);
    doc.text(lawText, 10, 41);

    // Repeated actual selected models, kept in dedicated equal-width cells.
    const systemY = 48;
    const systemH = 43;
    doc.setFillColor(242, 248, 252);
    doc.roundedRect(10, systemY, pageWidth - 20, systemH, 3, 3, 'F');
    const cellGap = 2;
    const availableW = pageWidth - 30 - cellGap * (multiFanQuantity - 1);
    const cellW = Math.min(29, availableW / multiFanQuantity);
    const systemStartX = (pageWidth - (cellW * multiFanQuantity + cellGap * (multiFanQuantity - 1))) / 2;
    const multiProductData = selectedProductUrl ? await loadImageAsBase64(selectedProductUrl) : null;
    for (let fanIndex = 0; fanIndex < multiFanQuantity; fanIndex += 1) {
      const cellX = systemStartX + fanIndex * (cellW + cellGap);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(180, 192, 204);
      doc.roundedRect(cellX, systemY + 7, cellW, 27, 1.5, 1.5, 'FD');
      if (multiProductData) {
        const imageFormat = multiProductData.base64.includes('image/png') ? 'PNG' : 'JPEG';
        const ratio = Math.min((cellW - 3) / multiProductData.width, 17 / multiProductData.height);
        const imageW = multiProductData.width * ratio;
        const imageH = multiProductData.height * ratio;
        doc.addImage(multiProductData.base64, imageFormat, cellX + (cellW - imageW) / 2, systemY + 10 + (17 - imageH) / 2, imageW, imageH, undefined, 'NONE');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(...COLORS.text);
      doc.text(`F${fanIndex + 1}`, cellX + cellW / 2, systemY + 32, { align: 'center' });
      if (fanIndex < multiFanQuantity - 1) {
        doc.setDrawColor(40, 120, 220);
        doc.setLineWidth(0.5);
        doc.line(cellX + cellW, systemY + 20.5, cellX + cellW + cellGap, systemY + 20.5);
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(isParallelSystem ? 0 : 140, isParallelSystem ? 125 : 75, isParallelSystem ? 205 : 190);
    doc.text(`INLET -> ${multiFanQuantity} x ${selection.nomenclature} -> COMBINED OUTLET`, pageWidth / 2, systemY + 39, { align: 'center' });

    // Single-fan and combined-system curves.
    const curveX = 23;
    const curveY = 106;
    const curveW = 164;
    const curveH = 68;
    const validCurve = performanceData.filter((point) => point.airflow >= 0 && point.staticPressure >= 0);
    const systemCurve = validCurve.map((point) => ({
      airflow: point.airflow * (isParallelSystem ? multiFanQuantity : 1),
      pressure: point.staticPressure * (isParallelSystem ? 1 : multiFanQuantity),
    }));
    const curveMaxFlow = Math.max(1, ...validCurve.map((point) => point.airflow), ...systemCurve.map((point) => point.airflow));
    const curveMaxPressure = Math.max(1, ...validCurve.map((point) => point.staticPressure), ...systemCurve.map((point) => point.pressure));
    const curvePoint = (airflow: number, pressure: number) => ({
      x: curveX + airflow / curveMaxFlow * curveW,
      y: curveY + curveH - pressure / curveMaxPressure * curveH,
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.text);
    doc.text('System effect on performance curve', 10, 101);
    doc.setDrawColor(150, 160, 170);
    doc.setLineWidth(0.35);
    doc.line(curveX, curveY, curveX, curveY + curveH);
    doc.line(curveX, curveY + curveH, curveX + curveW, curveY + curveH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.textLight);
    doc.text(`Static pressure (${PRESSURE_UNITS[pressureUnit].label})`, curveX - 8, curveY + curveH / 2, { angle: 90, align: 'center' });
    doc.text(`Airflow (${AIRFLOW_UNITS[airflowUnit].label})`, curveX + curveW / 2, curveY + curveH + 7, { align: 'center' });

    if (validCurve.length > 1) {
      doc.setDrawColor(105, 115, 125);
      doc.setLineWidth(0.45);
      doc.setLineDashPattern([2, 1.4], 0);
      for (let pointIndex = 1; pointIndex < validCurve.length; pointIndex += 1) {
        const previous = curvePoint(validCurve[pointIndex - 1].airflow, validCurve[pointIndex - 1].staticPressure);
        const current = curvePoint(validCurve[pointIndex].airflow, validCurve[pointIndex].staticPressure);
        doc.line(previous.x, previous.y, current.x, current.y);
      }
      doc.setLineDashPattern([], 0);
      doc.setDrawColor(30, 105, 220);
      doc.setLineWidth(0.9);
      for (let pointIndex = 1; pointIndex < systemCurve.length; pointIndex += 1) {
        const previous = curvePoint(systemCurve[pointIndex - 1].airflow, systemCurve[pointIndex - 1].pressure);
        const current = curvePoint(systemCurve[pointIndex].airflow, systemCurve[pointIndex].pressure);
        doc.line(previous.x, previous.y, current.x, current.y);
      }
    }
    doc.setFontSize(6);
    doc.setTextColor(105, 115, 125);
    doc.text('Dashed: single fan', curveX + 4, curveY + 5);
    doc.setTextColor(30, 105, 220);
    doc.text(`Blue: ${multiFanQuantity}-fan ${multiFanArrangement} system`, curveX + 39, curveY + 5);

    const singleAirflowDisplay = selection.operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor;
    const combinedAirflowDisplay = combinedFlowCmh * AIRFLOW_UNITS[airflowUnit].factor;
    const singlePressureDisplay = selection.operatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor;
    const combinedPressureDisplay = combinedStaticPa * PRESSURE_UNITS[pressureUnit].factor;
    autoTable(doc, {
      startY: 186,
      theme: 'grid',
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 1.6, lineColor: COLORS.border, textColor: COLORS.text },
      head: [['Parameter', 'One fan', `${multiFanQuantity}-fan ${multiFanArrangement}`, 'System effect']],
      body: [
        ['Airflow', `${singleAirflowDisplay.toFixed(1)} ${AIRFLOW_UNITS[airflowUnit].label}`, `${combinedAirflowDisplay.toFixed(1)} ${AIRFLOW_UNITS[airflowUnit].label}`, isParallelSystem ? `x ${multiFanQuantity}` : 'Unchanged'],
        ['Static pressure', `${singlePressureDisplay.toFixed(1)} ${PRESSURE_UNITS[pressureUnit].label}`, `${combinedPressureDisplay.toFixed(1)} ${PRESSURE_UNITS[pressureUnit].label}`, isParallelSystem ? 'Unchanged' : `x ${multiFanQuantity}`],
        ['Total pressure', `${totalPressure.toFixed(1)} Pa`, `${combinedTotalPa.toFixed(1)} Pa`, isParallelSystem ? 'Unchanged' : `x ${multiFanQuantity}`],
        ['Input power', `${selection.operatingPoint.shaftPower.toFixed(2)} kW`, `${combinedPowerKw.toFixed(2)} kW`, `x ${multiFanQuantity}`],
        ['Sound level', sourceNoise > 0 ? `${sourceNoise.toFixed(1)} dB(A)` : '-', combinedNoise > 0 ? `${combinedNoise.toFixed(1)} dB(A)` : '-', `+${(10 * Math.log10(multiFanQuantity)).toFixed(1)} dB`],
        ['Outlet area', `${fanAreaM2.toFixed(3)} m2`, `${combinedAreaM2.toFixed(3)} m2`, isParallelSystem ? `x ${multiFanQuantity}` : 'Unchanged'],
      ],
      margin: { left: 10, right: 10 },
    });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.5);
    doc.setTextColor(...COLORS.textLight);
    doc.text(
      'Ideal identical-fan combination. Verify the actual combined curve against system resistance, branch pressure losses, isolation/non-return dampers and control sequence.',
      10,
      pageHeight - 14,
      { maxWidth: pageWidth - 20 },
    );
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.25);
    doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(footerItems.join(' | ') || database.companyName, 10, footerY);
    doc.text(`Rev ${revisionDate}`, pageWidth / 2, footerY, { align: 'center' });
    const page4Text = pageLabel ? `${pageLabel} (4/4)` : 'Page 4/4';
    doc.text(page4Text, pageWidth - 10, footerY, { align: 'right' });
  }
  }
  
  // Save only if not in append mode
  if (!skipSave) {
    doc.save(`${selection.nomenclature}-datasheet.pdf`);
  }
  
  // Return the document for project mode
  return doc;
}

// Generate Technical Drawing Only PDF
export async function generateDrawingOnlyPDF(options: {
  selection: FanSelection;
  database: FanDatabase;
  seriesDrawingUrl?: string;
  flexibleDimensionSchema?: FlexibleDimensionParam[];
  flexibleDimensionValue?: FlexibleDimensionValue;
  fanDimensions?: any;
}) {
  const { selection, database, seriesDrawingUrl, flexibleDimensionSchema, flexibleDimensionValue, fanDimensions } = options;
  
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Header
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(0, 26, pageWidth, 26);
  
  // Logo
  if (database.logoUrl) {
    try {
      const logoData = await loadImageAsBase64(database.logoUrl);
      if (logoData) {
        doc.addImage(logoData.base64, 'PNG', 6, 4, 40, 18);
      }
    } catch {}
  }
  
  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Technical Drawing', pageWidth / 2, 14, { align: 'center' });
  
  // Model name
  let currentY = 32;
  doc.setFontSize(11);
  doc.text(`Model : ${selection.nomenclature}`, 10, currentY);
  currentY += 10;
  
  // Drawing
  const drawingHeight = 120;
  const drawingWidth = pageWidth - 30;
  const drawingX = 15;
  
  const drawingLoaded = await drawFanDrawingFromImage(
    doc, seriesDrawingUrl,
    drawingX, currentY, drawingWidth, drawingHeight
  );
  if (!drawingLoaded) {
    drawDrawingPlaceholder(doc, selection.diameter, drawingX, currentY, drawingWidth, drawingHeight);
  }
  
  currentY += drawingHeight + 10;
  
  // Dimensions table
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Dimensions (mm)', 10, currentY);
  
  if (flexibleDimensionSchema && flexibleDimensionSchema.length > 0 && flexibleDimensionValue) {
    const sortedSchema = [...flexibleDimensionSchema].sort((a, b) => a.display_order - b.display_order);
    const headers = ['Size', ...sortedSchema.map(p => p.param_label)];
    const dataRow = [
      flexibleDimensionValue.size?.toString() || selection.diameter.toString(),
      ...sortedSchema.map(p => {
        const val = flexibleDimensionValue.values[p.param_key];
        return val !== undefined && val !== null && val !== '' ? val.toString() : '-';
      })
    ];
    
    autoTable(doc, {
      startY: currentY + 4,
      margin: { left: 10, right: 10 },
      head: [headers],
      body: [dataRow],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: 'bold' },
    });
  } else if (fanDimensions) {
    autoTable(doc, {
      startY: currentY + 4,
      margin: { left: 10, right: 10 },
      head: [['Size', 'ΦD', 'ΦD1', 'ΦD2', 'H', 'E', 'F', 'L', 'K']],
      body: [[
        fanDimensions.size?.toString() || selection.diameter.toString(),
        fanDimensions.phiD?.toString() || '-',
        fanDimensions.phiD1?.toString() || '-',
        fanDimensions.phiD2?.toString() || '-',
        fanDimensions.H?.toString() || '-',
        fanDimensions.E?.toString() || '-',
        fanDimensions.F?.toString() || '-',
        fanDimensions.L?.toString() || '-',
        fanDimensions.K?.toString() || '-',
      ]],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: 'bold' },
    });
  }
  
  // Footer
  const footerY = pageHeight - 7;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, footerY, { align: 'center' });
  
  doc.save(`${selection.nomenclature}-drawing.pdf`);
}

// Generate Sound Data Only PDF
export async function generateSoundDataOnlyPDF(options: {
  selection: FanSelection;
  database: FanDatabase;
  noiseDistance?: number;
}) {
  const { selection, database, noiseDistance = 1 } = options;
  
  if (!selection.noiseData) {
    throw new Error('No noise data available');
  }
  
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Header
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(0, 26, pageWidth, 26);
  
  // Logo
  if (database.logoUrl) {
    try {
      const logoData = await loadImageAsBase64(database.logoUrl);
      if (logoData) {
        doc.addImage(logoData.base64, 'PNG', 6, 4, 40, 18);
      }
    } catch {}
  }
  
  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Sound Power Level Data', pageWidth / 2, 14, { align: 'center' });
  
  // Model name
  let currentY = 32;
  doc.setFontSize(11);
  doc.text(`Model : ${selection.nomenclature}`, 10, currentY);
  currentY += 10;
  
  // Check for octave band data
  const hasOctaveBandData = (
    selection.noiseData.hz63 !== undefined || selection.noiseData.hz125 !== undefined ||
    selection.noiseData.hz250 !== undefined || selection.noiseData.hz500 !== undefined ||
    selection.noiseData.hz1k !== undefined || selection.noiseData.hz2k !== undefined ||
    selection.noiseData.hz4k !== undefined || selection.noiseData.hz8k !== undefined
  );
  
  if (hasOctaveBandData) {
    // Draw noise chart
    drawNoiseChart(doc, selection.noiseData, 10, currentY, pageWidth - 20, 70);
    currentY += 80;
  }
  
  // Noise table
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Sound Data', 10, currentY);
  
  const noiseAtDist = {
    hz63: calculateNoiseAtDistance(selection.noiseData.hz63 || 0, noiseDistance),
    hz125: calculateNoiseAtDistance(selection.noiseData.hz125 || 0, noiseDistance),
    hz250: calculateNoiseAtDistance(selection.noiseData.hz250 || 0, noiseDistance),
    hz500: calculateNoiseAtDistance(selection.noiseData.hz500 || 0, noiseDistance),
    hz1k: calculateNoiseAtDistance(selection.noiseData.hz1k || 0, noiseDistance),
    hz2k: calculateNoiseAtDistance(selection.noiseData.hz2k || 0, noiseDistance),
    hz4k: calculateNoiseAtDistance(selection.noiseData.hz4k || 0, noiseDistance),
    hz8k: calculateNoiseAtDistance(selection.noiseData.hz8k || 0, noiseDistance),
    overall: calculateNoiseAtDistance(selection.noiseData.overall || 0, noiseDistance),
  };
  
  const ncAtDistance = calculateNCLevel(noiseAtDist);
  
  if (hasOctaveBandData) {
    autoTable(doc, {
      startY: currentY + 4,
      margin: { left: 10, right: 10 },
      head: [['Frequency', 'Source (dB)', `At ${noiseDistance}m (dB)`]],
      body: [
        ['63 Hz', selection.noiseData.hz63?.toString() || '-', noiseAtDist.hz63.toString()],
        ['125 Hz', selection.noiseData.hz125?.toString() || '-', noiseAtDist.hz125.toString()],
        ['250 Hz', selection.noiseData.hz250?.toString() || '-', noiseAtDist.hz250.toString()],
        ['500 Hz', selection.noiseData.hz500?.toString() || '-', noiseAtDist.hz500.toString()],
        ['1 kHz', selection.noiseData.hz1k?.toString() || '-', noiseAtDist.hz1k.toString()],
        ['2 kHz', selection.noiseData.hz2k?.toString() || '-', noiseAtDist.hz2k.toString()],
        ['4 kHz', selection.noiseData.hz4k?.toString() || '-', noiseAtDist.hz4k.toString()],
        ['8 kHz', selection.noiseData.hz8k?.toString() || '-', noiseAtDist.hz8k.toString()],
        ['Overall', selection.noiseData.overall?.toString() || '-', noiseAtDist.overall.toString()],
        [`NC @ ${noiseDistance}m`, '-', `NC-${ncAtDistance.level}`],
      ],
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255] },
    });
  } else {
    autoTable(doc, {
      startY: currentY + 4,
      margin: { left: 10, right: 10 },
      head: [['Parameter', 'Source', `At ${noiseDistance}m`]],
      body: [
        ['Overall Sound Level', `${selection.noiseData.overall?.toFixed(1) || '-'} dB(A)`, `${noiseAtDist.overall.toFixed(1)} dB(A)`],
      ],
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255] },
    });
  }
  
  const tableEndY = (doc as any).lastAutoTable?.finalY || currentY + 50;
  
  // NC description
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...COLORS.textLight);
  doc.text(`NC-${ncAtDistance.level}: ${ncAtDistance.description}`, 10, tableEndY + 6);
  doc.setFontSize(6);
  doc.text('Sound data is calculated and should be used as guideline only.', 10, tableEndY + 12);
  
  // Footer
  const footerY = pageHeight - 7;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(10, footerY - 3, pageWidth - 10, footerY - 3);
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, footerY, { align: 'center' });
  
  doc.save(`${selection.nomenclature}-sound-data.pdf`);
}
