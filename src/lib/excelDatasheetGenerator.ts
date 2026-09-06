import * as XLSX from 'xlsx';
import { FanSelection, FanPerformancePoint, OctaveBandData } from './fanData';
import { formatPower } from './utils';

interface MotorDetails {
  brandName?: string;
  frame?: string;
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
}

interface DimensionData {
  label: string;
  value: string | number;
}

interface ExcelDatasheetOptions {
  selection: FanSelection;
  performanceData: FanPerformancePoint[];
  operatingPoint: FanPerformancePoint;
  displayAirflow: number;
  displayPressure: number;
  displayDynamicPressure: number;
  displayTotalPressure: number;
  outletVelocity: number;
  fanRPM: number;
  airflowUnit: string;
  pressureUnit: string;
  airDensity?: number;
  temperature?: number;
  altitude?: number;
  motorDetails?: MotorDetails;
  weights?: {
    casing: number;
    impeller: number;
    motor: number;
    total: number;
  };
  dimensions?: DimensionData[];
  noiseData?: OctaveBandData;
  seriesDescription?: string;
}

// Helper to create styled header cell
function createHeaderStyle() {
  return {
    font: { bold: true },
    fill: { fgColor: { rgb: 'E0E0E0' } },
    alignment: { horizontal: 'center' }
  };
}

// Calculate NC level from octave band data
function calculateNCLevel(noiseData: OctaveBandData): { level: number; description: string } {
  const ncCurves: { [key: number]: number[] } = {
    15: [47, 36, 29, 22, 17, 14, 12, 11],
    20: [51, 40, 33, 26, 22, 19, 17, 16],
    25: [54, 44, 37, 31, 27, 24, 22, 21],
    30: [57, 48, 41, 35, 31, 29, 28, 27],
    35: [60, 52, 45, 40, 36, 34, 33, 32],
    40: [64, 57, 50, 45, 41, 39, 38, 37],
    45: [67, 60, 54, 49, 46, 44, 43, 42],
    50: [71, 64, 58, 54, 51, 49, 48, 47],
    55: [74, 67, 62, 58, 56, 54, 53, 52],
    60: [77, 71, 67, 63, 61, 59, 58, 57],
    65: [80, 75, 71, 68, 66, 64, 63, 62],
    70: [83, 79, 75, 72, 71, 70, 69, 68],
  };

  const octaveBands = [
    noiseData.hz63, noiseData.hz125, noiseData.hz250, noiseData.hz500,
    noiseData.hz1k, noiseData.hz2k, noiseData.hz4k, noiseData.hz8k
  ];

  // Check if any octave band data exists
  const hasOctaveBands = octaveBands.some(v => v && v > 0);

  // Helper to estimate NC from overall dB(A) value
  const estimateNCFromOverall = (overallDb: number): number => {
    // NC is typically 5-10 dB lower than overall dB(A)
    const estimatedNC = overallDb - 7;
    // Round to nearest NC level (15, 20, 25, 30, etc.)
    const ncLevels = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
    let closest = 15;
    for (const nc of ncLevels) {
      if (nc <= estimatedNC) {
        closest = nc;
      }
    }
    return closest;
  };

  let ncLevel = 15;

  // If no octave band data but overall exists, estimate from overall
  if (!hasOctaveBands && noiseData.overall && noiseData.overall > 0) {
    ncLevel = estimateNCFromOverall(noiseData.overall);
  } else {
    for (const [nc, curve] of Object.entries(ncCurves)) {
      const ncValue = parseInt(nc);
      let exceeds = false;
      for (let i = 0; i < 8; i++) {
        if (octaveBands[i] && octaveBands[i] > curve[i]) {
          exceeds = true;
          break;
        }
      }
      if (exceeds) {
        ncLevel = ncValue;
      }
    }
  }

  const descriptions: { [key: number]: string } = {
    15: 'Very Quiet - Concert Halls',
    20: 'Very Quiet - Recording Studios',
    25: 'Very Quiet - Private Offices',
    30: 'Quiet - Private Offices',
    35: 'Quiet - Conference Rooms',
    40: 'Moderate - General Offices',
    45: 'Moderate - Open Offices',
    50: 'Noisy - Restaurants',
    55: 'Noisy - Lobbies',
    60: 'Very Noisy - Kitchens',
    65: 'Very Noisy - Machine Shops',
    70: 'Loud - Factories',
  };

  return { level: ncLevel, description: descriptions[ncLevel] || 'Industrial' };
}

export function generateExcelDatasheet(options: ExcelDatasheetOptions): void {
  const {
    selection,
    performanceData,
    operatingPoint,
    displayAirflow,
    displayPressure,
    displayDynamicPressure,
    displayTotalPressure,
    outletVelocity,
    fanRPM,
    airflowUnit,
    pressureUnit,
    airDensity = 1.2,
    temperature = 20,
    altitude = 0,
    motorDetails,
    weights,
    dimensions,
    noiseData,
    seriesDescription,
  } = options;

  const workbook = XLSX.utils.book_new();

  // ===== SHEET 1: Fan Specifications =====
  const specsData: any[][] = [
    ['FAN TECHNICAL DATASHEET'],
    [''],
    ['Model', selection.nomenclature],
    ['Series', selection.series],
    ['Description', seriesDescription || ''],
    [''],
    ['CONSTRUCTION'],
    ['Diameter (mm)', selection.diameter],
    ['Blade Count', selection.bladeCount],
    ['Blade Angle (°)', selection.bladeAngle],
    ['Motor Poles', selection.motorPole],
    ['Motor Rating (kW)', selection.motorRating],
    ['Fan RPM', fanRPM],
    [''],
    ['DUTY POINT'],
    ['Airflow', displayAirflow.toFixed(2), airflowUnit],
    ['Static Pressure', displayPressure.toFixed(2), pressureUnit],
    [''],
    ['OPERATING POINT'],
    ['Airflow', displayAirflow.toFixed(2), airflowUnit],
    ['Static Pressure', displayPressure.toFixed(2), pressureUnit],
    ['Dynamic Pressure', displayDynamicPressure.toFixed(2), pressureUnit],
    ['Total Pressure', displayTotalPressure.toFixed(2), pressureUnit],
    ['Outlet Velocity (m/s)', outletVelocity.toFixed(2)],
    ['Shaft Power (kW)', formatPower(operatingPoint.shaftPower)],
    ['Efficiency (%)', operatingPoint.efficiency],
    ['SFP (W/l/s)', ((operatingPoint.shaftPower * 1000) / (displayAirflow / 3.6)).toFixed(3)],
    [''],
    ['AMBIENT CONDITIONS'],
    ['Temperature (°C)', temperature],
    ['Altitude (m)', altitude],
    ['Air Density (kg/m³)', airDensity.toFixed(3)],
  ];

  if (weights) {
    specsData.push(
      [''],
      ['WEIGHT DATA'],
      ['Casing Weight (kg)', weights.casing],
      ['Impeller Weight (kg)', weights.impeller],
      ['Motor Weight (kg)', weights.motor],
      ['Total Weight (kg)', weights.total],
    );
  }

  const specsSheet = XLSX.utils.aoa_to_sheet(specsData);
  specsSheet['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }];
  // Merge title cell
  specsSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  XLSX.utils.book_append_sheet(workbook, specsSheet, 'Specifications');

  // ===== SHEET 2: Motor Details =====
  if (motorDetails) {
    const motorData: any[][] = [
      ['MOTOR SPECIFICATIONS'],
      [''],
      ['Parameter', 'Value', 'Unit'],
      ['Brand', motorDetails.brandName || '-', ''],
      ['Frame Size', motorDetails.frame || '-', ''],
      ['Power Rating', selection.motorRating, 'kW'],
      ['Poles', selection.motorPole, ''],
      ['RPM', fanRPM, 'rpm'],
      ['Voltage', motorDetails.voltage || 415, 'V'],
      ['Frequency', motorDetails.frequency || 50, 'Hz'],
      ['Rated Current', motorDetails.ratedCurrent || '-', 'A'],
      ['Full Load Current (FLA)', motorDetails.fullLoadCurrent || '-', 'A'],
      ['Starting Current (LRA)', motorDetails.startingCurrent || '-', 'A'],
      ['IP Rating', motorDetails.ipRating || 'IP55', ''],
      ['Insulation Class', motorDetails.insulationClass || 'F', ''],
      ['Efficiency Class', motorDetails.efficiencyClass || 'IE3', ''],
      ['Motor Weight', motorDetails.motorWeight || '-', 'kg'],
    ];

    if (motorDetails.fireRating) {
      motorData.push(['Fire Rating', motorDetails.fireRating, '']);
    }

    const motorSheet = XLSX.utils.aoa_to_sheet(motorData);
    motorSheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }];
    motorSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    XLSX.utils.book_append_sheet(workbook, motorSheet, 'Motor Details');
  }

  // ===== SHEET 3: Performance Data =====
  const perfHeader = ['Point', 'Airflow (m³/h)', 'Static Pressure (Pa)', 'Shaft Power (kW)', 'Efficiency (%)'];
  const perfRows = performanceData.map((point, index) => [
    index + 1,
    point.airflow,
    point.staticPressure,
    point.shaftPower,
    point.efficiency,
  ]);

  const perfData: any[][] = [
    ['PERFORMANCE CURVE DATA'],
    [''],
    [`Fan: ${selection.nomenclature} | Blade Angle: ${selection.bladeAngle}° | Motor: ${selection.motorPole}P`],
    [''],
    perfHeader,
    ...perfRows,
    [''],
    ['OPERATING POINT'],
    ['', displayAirflow.toFixed(1), displayPressure.toFixed(1), operatingPoint.shaftPower, operatingPoint.efficiency],
  ];

  const perfSheet = XLSX.utils.aoa_to_sheet(perfData);
  perfSheet['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 15 }];
  perfSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
  ];
  XLSX.utils.book_append_sheet(workbook, perfSheet, 'Performance Data');

  // ===== SHEET 4: Noise Data =====
  if (noiseData) {
    const ncResult = calculateNCLevel(noiseData);
    
    const noiseSheetData: any[][] = [
      ['SOUND POWER LEVELS (dB re 1pW)'],
      [''],
      [`Fan: ${selection.nomenclature} | Operating at ${displayAirflow.toFixed(0)} ${airflowUnit}`],
      [''],
      ['Frequency Band', 'Sound Power Level (dB)'],
      ['63 Hz', noiseData.hz63],
      ['125 Hz', noiseData.hz125],
      ['250 Hz', noiseData.hz250],
      ['500 Hz', noiseData.hz500],
      ['1 kHz', noiseData.hz1k],
      ['2 kHz', noiseData.hz2k],
      ['4 kHz', noiseData.hz4k],
      ['8 kHz', noiseData.hz8k],
      [''],
      ['Overall (dBA)', noiseData.overall],
      [''],
      ['NOISE CRITERIA'],
      ['NC Level', `NC-${ncResult.level}`],
      ['Application', ncResult.description],
      [''],
      ['NOTES'],
      ['Sound power levels measured per ISO 13347 / AMCA 300'],
      ['Values shown are at fan inlet/outlet'],
      ['Actual installed levels depend on system design and installation'],
    ];

    const noiseSheet = XLSX.utils.aoa_to_sheet(noiseSheetData);
    noiseSheet['!cols'] = [{ wch: 25 }, { wch: 25 }];
    noiseSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
    ];
    XLSX.utils.book_append_sheet(workbook, noiseSheet, 'Noise Data');
  }

  // ===== SHEET 5: Dimensions =====
  if (dimensions && dimensions.length > 0) {
    const dimData: any[][] = [
      ['DIMENSIONAL DATA'],
      [''],
      [`Fan Size: ${selection.diameter}mm`],
      [''],
      ['Parameter', 'Value (mm)'],
      ...dimensions.map(d => [d.label, d.value]),
      [''],
      ['Note: All dimensions in millimeters unless otherwise specified'],
    ];

    const dimSheet = XLSX.utils.aoa_to_sheet(dimData);
    dimSheet['!cols'] = [{ wch: 20 }, { wch: 15 }];
    dimSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
    ];
    XLSX.utils.book_append_sheet(workbook, dimSheet, 'Dimensions');
  }

  // ===== SHEET 6: Summary for Quick Reference =====
  const summaryData: any[][] = [
    ['QUICK REFERENCE SUMMARY'],
    [''],
    ['Model', selection.nomenclature],
    [''],
    ['Key Specifications', 'Value', 'Unit'],
    ['Airflow', displayAirflow.toFixed(1), airflowUnit],
    ['Static Pressure', displayPressure.toFixed(1), pressureUnit],
    ['Total Pressure', displayTotalPressure.toFixed(1), pressureUnit],
    ['Shaft Power', formatPower(operatingPoint.shaftPower), 'kW'],
    ['Motor Rating', formatPower(selection.motorRating), 'kW'],
    ['Efficiency', operatingPoint.efficiency, '%'],
    ['Fan Speed', fanRPM, 'RPM'],
    [''],
    ['Dimensions', '', ''],
    ['Diameter', selection.diameter, 'mm'],
    ['Blade Count', selection.bladeCount, ''],
    ['Blade Angle', selection.bladeAngle, '°'],
    [''],
  ];

  if (weights) {
    summaryData.push(['Total Weight', weights.total, 'kg']);
  }

  if (noiseData) {
    summaryData.push(['Overall Noise', noiseData.overall, 'dBA']);
  }

  summaryData.push(
    [''],
    ['Generated', new Date().toLocaleDateString(), ''],
  );

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 10 }];
  summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Generate filename and save
  const filename = `${selection.nomenclature}_Datasheet_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
