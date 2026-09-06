// Fan Data Types and Dummy Data for KINAIR Fan Selector

export interface FanPerformancePoint {
  airflow: number; // CMH
  staticPressure: number; // Pa
  shaftPower: number; // kW
  efficiency: number; // Static Efficiency %
  totalEfficiency?: number; // Total Efficiency %
}

export interface OctaveBandData {
  hz63: number;
  hz125: number;
  hz250: number;
  hz500: number;
  hz1k: number;
  hz2k: number;
  hz4k: number;
  hz8k: number;
  overall: number;
}

/**
 * Calculate overall sound pressure level from octave band data using logarithmic addition
 * Formula: Lp = 10 * log10(sum of 10^(Li/10) for each band)
 */
export function calculateOverallFromOctaveBands(noiseData: Partial<OctaveBandData>): number {
  const bands = [
    noiseData.hz63 || 0,
    noiseData.hz125 || 0,
    noiseData.hz250 || 0,
    noiseData.hz500 || 0,
    noiseData.hz1k || 0,
    noiseData.hz2k || 0,
    noiseData.hz4k || 0,
    noiseData.hz8k || 0,
  ];
  
  // Filter out zero/invalid values
  const validBands = bands.filter(b => b > 0);
  if (validBands.length === 0) return 0;
  
  // Logarithmic addition of sound levels
  const sumPower = validBands.reduce((sum, level) => sum + Math.pow(10, level / 10), 0);
  return Math.round(10 * Math.log10(sumPower) * 10) / 10;
}

export interface BladeConfiguration {
  bladeCount: number;
  bladeAngles: number[];
  performanceData: {
    [angle: number]: FanPerformancePoint[];
  };
  noiseData: {
    [angle: number]: OctaveBandData;
  };
}

// Fan series types
export type FanSeries = 'KAF' | 'KAF-W' | 'KAF-R' | string;

// Fan types - axial (diameter-based), centrifugal (model name like 7/7, 10/10), or mixed flow
export type FanType = 'axial' | 'centrifugal' | 'mixed';

export interface SeriesInfo {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  drawingUrl?: string;
  datasheetDescription?: string;
  showOctaveBands?: boolean;
  amcaCertified?: boolean;
  fireRating?: string;
  amcaLogoUrl?: string;
  fireRatingLogoUrl?: string;
  fanType?: FanType;
  nomenclatureTemplate?: string;
  // Additional certifications
  ceCertified?: boolean;
  ceLogoUrl?: string;
  ulCertified?: boolean;
  ulLogoUrl?: string;
  isoCertified?: boolean;
  isoLogoUrl?: string;
  atexCertified?: boolean;
  atexLogoUrl?: string;
  customCertName?: string;
  customCertLogoUrl?: string;
}

// Empty default series - users must add their own
export const DEFAULT_SERIES: SeriesInfo[] = [];

export interface FanModel {
  id: string;
  diameter: number; // mm - used for axial fans
  modelName?: string; // Model name like "7/7", "10/10" - used for centrifugal fans or as display name
  productCode?: string; // Unique product identifier code
  motorPoles: number[]; // 2P, 4P, 6P, 8P, 12P
  referencePoles?: number; // Base data pole count (default 4) - other poles derived via fan laws
  bladeConfigurations: BladeConfiguration[];
  drawingUrl?: string;
  series: FanSeries;
  fanType?: FanType; // inherited from series
  specifications?: {
    weight?: number;
    dimensions?: { a?: number; b?: number; c?: number; d?: number };
    ipRating?: string;
    insulationClass?: string;
  };
}

// Helper function to get display name for a fan model
export function getFanModelDisplayName(fan: FanModel): string {
  if (fan.modelName) {
    return fan.modelName;
  }
  return `${fan.diameter}`;
}

export interface ContactInfo {
  email: string;
  phone: string;
  address?: string;
}

// Fan dimension data based on diameter
export interface FanDimension {
  size: number;      // Fan diameter (mm)
  phiD2: number;     // ΦD2 (mm)
  phiD1: number;     // ΦD1 (mm)
  phiD: number;      // ΦD (mm)
  H: number;         // H dimension (mm)
  E: number;         // E dimension (mm)
  F: number;         // F dimension (mm)
  L: number;         // L dimension (mm)
  K: number;         // K dimension (mm)
  nPhiD: string;     // n-Φd (bolt pattern)
  zPhiD1: string;    // z-Φd1 (mounting holes)
  motorMax: string;  // Motor max frame size
}

// Standard motor frame sizes in order (smallest to largest)
// Frame sizes follow IEC standard: number indicates center height in mm
// Letters: S=Short, M=Medium, L=Long body length
const MOTOR_FRAME_ORDER = [
  '56', '63', '71', '80', '90S', '90L', '100L', '112M', 
  '132S', '132M', '160M', '160L', '180M', '180L', 
  '200L', '225S', '225M', '250M', '280S', '280M', 
  '315S', '315M', '315L', '355M', '355L'
];

/**
 * Parse motor frame size to get a comparable numeric value
 * Higher value = larger frame
 */
export function parseMotorFrame(frame: string): number {
  if (!frame) return -1;
  
  const cleaned = frame.trim().toUpperCase();
  const index = MOTOR_FRAME_ORDER.findIndex(f => f.toUpperCase() === cleaned);
  if (index >= 0) return index;
  
  // Try to parse just the number for partial matches
  const match = cleaned.match(/^(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    // Find the first frame that starts with this number
    const firstMatch = MOTOR_FRAME_ORDER.findIndex(f => f.startsWith(String(num)));
    return firstMatch >= 0 ? firstMatch : num;
  }
  
  return -1;
}

/**
 * Check if motor frame is within the max allowed for a fan casing
 * Returns true if motor can fit, false otherwise
 */
export function isMotorFrameAllowed(motorFrame: string, maxFrame: string): boolean {
  if (!maxFrame || maxFrame.trim() === '') return true; // No limit set
  if (!motorFrame || motorFrame.trim() === '') return true; // No motor frame specified
  
  const motorValue = parseMotorFrame(motorFrame);
  const maxValue = parseMotorFrame(maxFrame);
  
  if (motorValue < 0 || maxValue < 0) return true; // Can't compare, allow
  
  return motorValue <= maxValue;
}

// Unit preferences
export interface UnitPreferences {
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  powerUnit: 'kW' | 'HP';
  defaultToleranceMin?: number;
  defaultToleranceMax?: number;
}

export const POWER_UNITS = {
  kW: { label: 'kW', factor: 1 },
  HP: { label: 'HP', factor: 1.34102 },
};

export const DEFAULT_UNIT_PREFERENCES: UnitPreferences = {
  airflowUnit: 'CMH',
  pressureUnit: 'Pa',
  powerUnit: 'kW',
  defaultToleranceMin: 95,
  defaultToleranceMax: 105,
};

// Motor brand/manufacturer
export interface MotorBrand {
  id: string;
  name: string;
}

// Motor class types
export type MotorClass = 'None' | 'F' | 'H' | 'B';
export type MotorFireRating = '' | 'F250' | 'F300' | 'F400';
export type MotorEfficiencyClass = 'None' | 'IE1' | 'IE2' | 'IE3' | 'IE4';
export type MotorAtexRating = '' | 'II2GExdIIB(H2)T4' | 'II2GExdIIBT4' | 'II2GExeIIT3' | 'II3DExtcIIIBT125' | 'II3DExtcIIICT125';

// Motor specification with all details
export interface MotorSpecification {
  id: string;
  brandId: string;
  phase: number; // 1-phase or 3-phase motor
  motorPoles: number;
  ratingKW: number;
  motorFrame: string; // Frame size like 80, 90L, 100L, 112M, 132S, etc.
  motorWeight: number; // kg
  fullLoadCurrent: number; // Amps
  ratedCurrent: number; // Amps
  startingCurrent?: number; // Amps - motor starting current
  voltage: number; // Volts
  frequency: number; // Hz
  ipRating: string; // IP55, IP66, etc.
  insulationClass: MotorClass;
  efficiencyClass: MotorEfficiencyClass;
  rpm: number;
  fireRating?: MotorFireRating;
  atexRating?: MotorAtexRating;
}

// Casing weight by diameter or model name
export interface CasingWeight {
  diameter: number; // mm - for axial fans
  modelName?: string; // For centrifugal fans like "7/7", "10/10"
  weight: number; // kg
}

// Impeller weight by diameter/model name and blade count
export interface ImpellerWeight {
  diameter: number; // mm - for axial fans
  modelName?: string; // For centrifugal fans like "7/7", "10/10"
  bladeCount: number;
  weight: number; // kg
}

// Weight database
export interface WeightDatabase {
  casingWeights: CasingWeight[];
  impellerWeights: ImpellerWeight[];
}

// Default casing weights
export const DEFAULT_CASING_WEIGHTS: CasingWeight[] = [
  { diameter: 315, weight: 22 },
  { diameter: 355, weight: 26 },
  { diameter: 400, weight: 34 },
  { diameter: 450, weight: 42 },
  { diameter: 500, weight: 55 },
  { diameter: 560, weight: 72 },
  { diameter: 630, weight: 95 },
  { diameter: 710, weight: 125 },
  { diameter: 800, weight: 165 },
  { diameter: 900, weight: 210 },
  { diameter: 1000, weight: 260 },
  { diameter: 1120, weight: 330 },
  { diameter: 1250, weight: 420 },
  { diameter: 1400, weight: 540 },
  { diameter: 1600, weight: 720 },
];

// Default impeller weights
export const DEFAULT_IMPELLER_WEIGHTS: ImpellerWeight[] = [
  { diameter: 315, bladeCount: 4, weight: 3 },
  { diameter: 315, bladeCount: 6, weight: 4 },
  { diameter: 355, bladeCount: 4, weight: 4 },
  { diameter: 355, bladeCount: 6, weight: 5 },
  { diameter: 400, bladeCount: 4, weight: 5 },
  { diameter: 400, bladeCount: 6, weight: 6 },
  { diameter: 450, bladeCount: 4, weight: 6 },
  { diameter: 450, bladeCount: 6, weight: 8 },
  { diameter: 500, bladeCount: 4, weight: 8 },
  { diameter: 500, bladeCount: 6, weight: 10 },
  { diameter: 560, bladeCount: 4, weight: 11 },
  { diameter: 560, bladeCount: 6, weight: 14 },
  { diameter: 630, bladeCount: 4, weight: 15 },
  { diameter: 630, bladeCount: 6, weight: 18 },
  { diameter: 710, bladeCount: 5, weight: 20 },
  { diameter: 710, bladeCount: 9, weight: 25 },
  { diameter: 800, bladeCount: 6, weight: 28 },
  { diameter: 800, bladeCount: 9, weight: 34 },
  { diameter: 900, bladeCount: 6, weight: 38 },
  { diameter: 900, bladeCount: 9, weight: 45 },
  { diameter: 1000, bladeCount: 6, weight: 50 },
  { diameter: 1000, bladeCount: 9, weight: 60 },
  { diameter: 1120, bladeCount: 6, weight: 65 },
  { diameter: 1120, bladeCount: 9, weight: 75 },
  { diameter: 1250, bladeCount: 6, weight: 85 },
  { diameter: 1250, bladeCount: 9, weight: 100 },
  { diameter: 1250, bladeCount: 12, weight: 135 },
  { diameter: 1400, bladeCount: 6, weight: 110 },
  { diameter: 1400, bladeCount: 9, weight: 130 },
  { diameter: 1400, bladeCount: 12, weight: 175 },
  { diameter: 1600, bladeCount: 6, weight: 150 },
  { diameter: 1600, bladeCount: 9, weight: 180 },
  { diameter: 1600, bladeCount: 12, weight: 235 },
];

// Default weight database
export const DEFAULT_WEIGHT_DATABASE: WeightDatabase = {
  casingWeights: [...DEFAULT_CASING_WEIGHTS],
  impellerWeights: [...DEFAULT_IMPELLER_WEIGHTS],
};

// Motor database
export interface MotorDatabase {
  brands: MotorBrand[];
  specifications: MotorSpecification[];
}

// Default motor brands
export const DEFAULT_MOTOR_BRANDS: MotorBrand[] = [
  { id: 'havells', name: 'Havells' },
  { id: 'att', name: 'ATT' },
  { id: 'weg', name: 'WEG' },
];

// Default empty motor database
export const DEFAULT_MOTOR_DATABASE: MotorDatabase = {
  brands: [...DEFAULT_MOTOR_BRANDS],
  specifications: [],
};

export interface FanDatabase {
  logoUrl: string;
  companyName: string;
  contactInfo: ContactInfo;
  fans: FanModel[];
  series: SeriesInfo[];
  seriesDrawings: SeriesDrawingData[]; // Drawing & dimensions per series
  unitPreferences: UnitPreferences;
  motorDatabase: MotorDatabase;
  weightDatabase: WeightDatabase;
}

// Series-specific drawing and dimensions
export interface SeriesDrawingData {
  seriesId: string;
  drawingUrl: string;
  dimensions: FanDimension[];
}

// Motor class types (insulation and fire ratings)
export type FireClass = '' | 'ClassB' | 'ClassH' | 'F250' | 'F300' | 'F400';

// Accessory types for fan configurations
export type AccessoryType = '' | 'ET' | 'ID' | 'ETID';

// ATEX rating types for explosive atmosphere certification
export type AtexRating = '' | 'II2GExdIIB(H2)T4' | 'II2GExdIIBT4' | 'II2GExeIIT3' | 'II3DExtcIIIBT125' | 'II3DExtcIIICT125';

// All available ATEX ratings for selection
export const ATEX_RATINGS: AtexRating[] = [
  '',
  'II2GExdIIB(H2)T4',
  'II2GExdIIBT4',
  'II2GExeIIT3',
  'II3DExtcIIIBT125',
  'II3DExtcIIICT125',
];

// Accessory descriptions
export const ACCESSORY_DESCRIPTIONS: Record<AccessoryType, string> = {
  '': 'Standard configuration',
  'ET': 'External Terminal Box: Features an external terminal box for quick electrical connections and a spy hole for impeller rotation inspection.',
  'ID': 'Inspection Door: Incorporates an inspection door for direct motor access, enabling quick checks and servicing.',
  'ETID': 'External Terminal Box & Inspection Door: Combines both features for maximum convenience in electrical connections and motor access.',
};

// ATEX descriptions
export const ATEX_DESCRIPTIONS: Record<AtexRating, string> = {
  '': 'Standard (non-ATEX)',
  'II2GExdIIB(H2)T4': 'Group II Category 2G, Flameproof Ex d, Gas Group IIB including Hydrogen, Temperature Class T4 (135°C)',
  'II2GExdIIBT4': 'Group II Category 2G, Flameproof Ex d, Gas Group IIB, Temperature Class T4 (135°C)',
  'II2GExeIIT3': 'Group II Category 2G, Increased Safety Ex e, Gas Group II, Temperature Class T3 (200°C)',
  'II3DExtcIIIBT125': 'Group II Category 3D, Dust Protection by Enclosure Ex tc, Dust Group IIIB, Max Surface Temp 125°C',
  'II3DExtcIIICT125': 'Group II Category 3D, Dust Protection by Enclosure Ex tc, Dust Group IIIC, Max Surface Temp 125°C',
};

// Motor safety factors - extended range
export const MOTOR_SAFETY_FACTORS = [1.0, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5];

// Standard motor ratings (kW) - includes smaller ratings for centrifugal fans
export const STANDARD_MOTOR_RATINGS = [
  0.045, 0.055, 0.075, 0.09, 0.1, 0.12, 0.13, 0.18, 0.25, 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.7, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160
];

// Frequency options
export type Frequency = 50 | 60;

// Unit conversion factors
export const AIRFLOW_UNITS = {
  CMH: { label: 'CMH (m³/h)', factor: 1 },
  LPS: { label: 'LPS (L/s)', factor: 0.277778 },
  CFM: { label: 'CFM', factor: 0.588578 },
  CMS: { label: 'CMS (m³/s)', factor: 0.000277778 },
};

export const PRESSURE_UNITS = {
  Pa: { label: 'Pa', factor: 1 },
  inwg: { label: 'in.wg', factor: 0.00401865 },
  mmwg: { label: 'mm.wg', factor: 0.101972 },
};

// Calculate motor rating based on shaft power and safety factor
export function calculateMotorRating(shaftPower: number, safetyFactor: number = 1.15): number {
  const requiredPower = shaftPower * safetyFactor;
  // Find the smallest standard motor rating that meets the requirement
  const rating = STANDARD_MOTOR_RATINGS.find(r => r >= requiredPower) || STANDARD_MOTOR_RATINGS[STANDARD_MOTOR_RATINGS.length - 1];
  return rating; // No minimum - allow small motors for centrifugal fans
}

// Generate fan nomenclature using series-specific template
export function generateNomenclature(
  motorPole: number,
  diameter: number,
  bladeCount: number,
  bladeAngle: number,
  motorRating: number,
  fireClass: FireClass = '',
  nomenclatureTemplate?: string,
  seriesName?: string,
  accessory: AccessoryType = '',
  atexRating: AtexRating = ''
): string {
  // Use template if provided, otherwise fall back to legacy KTAF format
  if (nomenclatureTemplate) {
    let result = nomenclatureTemplate
      .replace('{series}', seriesName || '')
      .replace('{size}', String(diameter))
      .replace('{diameter}', String(diameter))
      .replace('{poles}', String(motorPole))
      .replace('{blades}', String(bladeCount))
      .replace('{angle}', String(bladeAngle))
      .replace('{power}', String(motorRating));
    
    // Check if template has fire/accessory/atex placeholders
    const hasFirePlaceholder = nomenclatureTemplate.includes('{fire}');
    const hasAccessoryPlaceholder = nomenclatureTemplate.includes('{accessory}');
    const hasAtexPlaceholder = nomenclatureTemplate.includes('{atex}');
    
    // Replace placeholders if they exist
    if (hasFirePlaceholder) {
      result = result.replace('{fire}', fireClass || '');
      // Clean up if no fire class provided
      if (!fireClass) {
        result = result.replace(/-$/, '');
      }
    }
    if (hasAccessoryPlaceholder) {
      result = result.replace('{accessory}', accessory || '');
      // Clean up if no accessory provided
      if (!accessory) {
        result = result.replace(/-$/, '');
      }
    }
    if (hasAtexPlaceholder) {
      result = result.replace('{atex}', atexRating || '');
      // Clean up if no ATEX rating provided
      if (!atexRating) {
        result = result.replace(/-$/, '');
      }
    }
    
    // AUTO-APPEND: If accessory/atex/fire are selected but NOT in template, append them
    // Order: accessory first, then atex, then fire (e.g., ETID-Zone2-F400)
    if (!hasAccessoryPlaceholder && accessory) {
      result = `${result}-${accessory}`;
    }
    if (!hasAtexPlaceholder && atexRating) {
      result = `${result}-${atexRating}`;
    }
    if (!hasFirePlaceholder && fireClass) {
      result = `${result}-${fireClass}`;
    }
    
    // Clean up any double dashes or trailing dashes
    result = result.replace(/--+/g, '-').replace(/-$/, '');
    return result;
  }
  
  // Legacy fallback for backward compatibility
  let base = `KTAF/${motorPole}-${diameter}-${bladeCount}/${bladeAngle}°-${motorRating}kW`;
  if (accessory) base = `${base}-${accessory}`;
  if (atexRating) base = `${base}-${atexRating}`;
  if (fireClass) base = `${base}-${fireClass}`;
  return base;
}

/**
 * Generate a dynamic description based on what placeholders are NOT used in the nomenclature template.
 * If a property is already in the nomenclature, we don't need to show it in the description.
 * 
 * @param template - The nomenclature template (e.g., "{series}-{size}M" or "KTAF/{poles}-{diameter}-{blades}/{angle}°")
 * @param params - The fan parameters
 * @returns A description string with only the properties not included in the template
 */
export function generateDynamicDescription(
  template: string | undefined,
  params: {
    diameter: number;
    bladeCount: number;
    bladeAngle: number;
    motorPole: number;
    motorRating?: number;
    series?: string;
    fireClass?: FireClass;
    accessory?: AccessoryType;
  }
): string {
  // Check if this is a non-axial fan (centrifugal/mixed flow) - blade count 0 indicates non-axial
  const isNonAxial = params.bladeCount === 0;
  
  // If no template, show full legacy description
  if (!template) {
    let desc = `Ø${params.diameter}mm`;
    if (!isNonAxial) {
      desc += ` · ${params.bladeCount} Blades · ${params.bladeAngle}° Pitch`;
    }
    desc += ` · ${params.motorPole}P`;
    if (params.accessory) desc += ` · ${params.accessory}`;
    return desc;
  }
  
  const parts: string[] = [];
  
  // Check which placeholders are NOT in the template
  const templateLower = template.toLowerCase();
  
  // Diameter/Size - show if neither {size} nor {diameter} is in template
  if (!templateLower.includes('{size}') && !templateLower.includes('{diameter}')) {
    parts.push(`Ø${params.diameter}mm`);
  }
  
  // Blade count - show if {blades} is not in template AND this is an axial fan
  if (!templateLower.includes('{blades}') && !isNonAxial) {
    parts.push(`${params.bladeCount} Blades`);
  }
  
  // Blade angle - show if {angle} is not in template AND this is an axial fan
  if (!templateLower.includes('{angle}') && !isNonAxial) {
    parts.push(`${params.bladeAngle}° Pitch`);
  }
  
  // Motor poles - show if {poles} is not in template
  if (!templateLower.includes('{poles}')) {
    parts.push(`${params.motorPole}P`);
  }
  
  // Motor rating - show if {power} is not in template and motorRating is provided
  if (!templateLower.includes('{power}') && params.motorRating !== undefined) {
    parts.push(`${params.motorRating}kW`);
  }
  
  // Fire class - show if {fire} is not in template and fireClass is provided
  if (!templateLower.includes('{fire}') && params.fireClass) {
    parts.push(params.fireClass);
  }
  
  // Accessory - show if {accessory} is not in template and accessory is provided
  if (!templateLower.includes('{accessory}') && params.accessory) {
    parts.push(params.accessory);
  }
  
  return parts.join(' · ');
}

// Get RPM based on motor pole and frequency
// Using standard motor RPM values at 50Hz
const MOTOR_RPM_50HZ: Record<number, number> = {
  2: 2850,
  4: 1450,
  6: 950,
  8: 720,
  10: 580,
  12: 480,
};

// RPM values scale proportionally with frequency
export function getMotorRPM(motorPole: number, frequency: Frequency = 50): number {
  const baseRPM = MOTOR_RPM_50HZ[motorPole];
  if (baseRPM) {
    // Scale RPM based on frequency ratio
    return Math.round(baseRPM * (frequency / 50));
  }
  // Fallback for other pole counts: use slip calculation
  const synchronousRPM = (120 * frequency) / motorPole;
  const slipFactor = 0.96;
  return Math.round(synchronousRPM * slipFactor);
}

// Generate realistic performance curve (12 points)
function generatePerformanceCurve(
  diameter: number,
  bladeCount: number,
  bladeAngle: number,
  motorPole: number = 4
): FanPerformancePoint[] {
  // Base calculations scaled by diameter
  const diameterFactor = Math.pow(diameter / 500, 3);
  const bladeFactor = bladeCount / 6;
  const angleFactor = bladeAngle / 35;
  const poleFactor = motorPole === 2 ? 1.4 : motorPole === 6 ? 0.7 : motorPole === 8 ? 0.5 : motorPole === 12 ? 0.35 : 1;
  
  const maxAirflow = 15000 * diameterFactor * bladeFactor * angleFactor * poleFactor;
  const maxPressure = 400 * Math.pow(diameter / 500, 2) * angleFactor;
  
  const points: FanPerformancePoint[] = [];
  
  for (let i = 0; i < 12; i++) {
    const ratio = i / 11;
    const airflow = maxAirflow * ratio;
    
    // Parabolic pressure curve
    const staticPressure = maxPressure * (1 - Math.pow(ratio, 2));
    
    // Power curve (rises with airflow)
    const basePower = (diameter / 1000) * bladeFactor * angleFactor * poleFactor;
    const shaftPower = basePower * (0.3 + 0.7 * ratio) * (0.8 + 0.4 * Math.random());
    
    // Efficiency curve (bell curve peaking around 60-70% airflow)
    const efficiencyPeak = 0.65;
    const efficiencySpread = 0.3;
    const efficiency = 85 * Math.exp(-Math.pow((ratio - efficiencyPeak) / efficiencySpread, 2));
    
    points.push({
      airflow: Math.round(airflow),
      staticPressure: Math.round(staticPressure * 10) / 10,
      shaftPower: Math.round(shaftPower * 100) / 100,
      efficiency: Math.round(efficiency * 10) / 10,
    });
  }
  
  return points;
}

// Generate noise data
function generateNoiseData(diameter: number, bladeAngle: number): OctaveBandData {
  const baseNoise = 50 + (diameter / 50) + (bladeAngle / 5);
  
  return {
    hz63: Math.round(baseNoise + 15 + Math.random() * 5),
    hz125: Math.round(baseNoise + 12 + Math.random() * 5),
    hz250: Math.round(baseNoise + 8 + Math.random() * 5),
    hz500: Math.round(baseNoise + 5 + Math.random() * 5),
    hz1k: Math.round(baseNoise + 3 + Math.random() * 5),
    hz2k: Math.round(baseNoise + Math.random() * 5),
    hz4k: Math.round(baseNoise - 3 + Math.random() * 5),
    hz8k: Math.round(baseNoise - 6 + Math.random() * 5),
    overall: Math.round(baseNoise + 18 + Math.random() * 3),
  };
}

// Available diameters
export const FAN_DIAMETERS = [315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1600];

// Blade configurations per diameter
const BLADE_CONFIGS: { [diameter: number]: number[] } = {
  315: [4, 6],
  355: [4, 6],
  400: [4, 6, 9],
  450: [4, 6, 9],
  500: [4, 6, 9],
  560: [6, 9, 12],
  630: [6, 9, 12],
  710: [6, 9, 12],
  800: [6, 9, 12],
  900: [9, 12],
  1000: [9, 12],
  1120: [9, 12],
  1250: [9, 12],
  1400: [9, 12],
  1600: [9, 12],
};

// Empty by default - users define their own blade angles when creating fan models
export const BLADE_ANGLES: number[] = [];
export const MOTOR_POLES = [2, 4, 6, 8, 12];

// Dual-speed motor pole options for curves
export const DUAL_SPEED_POLE_OPTIONS = [
  { label: '2/4 Pole', poles: [2, 4], id: '2-4' },
  { label: '4/6 Pole', poles: [4, 6], id: '4-6' },
  { label: '4/8 Pole', poles: [4, 8], id: '4-8' },
  { label: '6/12 Pole', poles: [6, 12], id: '6-12' },
];

// All motor pole options including dual-speed
export const ALL_MOTOR_POLE_OPTIONS = [
  { label: '2 Pole', value: 2, isDual: false },
  { label: '4 Pole', value: 4, isDual: false },
  { label: '6 Pole', value: 6, isDual: false },
  { label: '8 Pole', value: 8, isDual: false },
  { label: '12 Pole', value: 12, isDual: false },
  { label: '2/4 Pole (Dual)', value: '2-4', isDual: true, poles: [2, 4] },
  { label: '4/6 Pole (Dual)', value: '4-6', isDual: true, poles: [4, 6] },
  { label: '4/8 Pole (Dual)', value: '4-8', isDual: true, poles: [4, 8] },
  { label: '6/12 Pole (Dual)', value: '6-12', isDual: true, poles: [6, 12] },
];

// Default fan dimensions data
export const DEFAULT_FAN_DIMENSIONS: FanDimension[] = [
  { size: 315,  phiD2: 320,  phiD1: 366,  phiD: 398,  H: 205, E: 265,  F: 315,  L: 420,  K: 358, nPhiD: '8-Φ10',  zPhiD1: '4-Φ10', motorMax: '80Z' },
  { size: 355,  phiD2: 359,  phiD1: 405,  phiD: 438,  H: 225, E: 305,  F: 355,  L: 420,  K: 358, nPhiD: '8-Φ10',  zPhiD1: '4-Φ10', motorMax: '80Z' },
  { size: 400,  phiD2: 401,  phiD1: 448,  phiD: 484,  H: 250, E: 350,  F: 400,  L: 435,  K: 373, nPhiD: '12-Φ10', zPhiD1: '4-Φ10', motorMax: '90L' },
  { size: 450,  phiD2: 450,  phiD1: 497,  phiD: 534,  H: 280, E: 400,  F: 450,  L: 435,  K: 373, nPhiD: '12-Φ10', zPhiD1: '4-Φ10', motorMax: '112M' },
  { size: 500,  phiD2: 503,  phiD1: 551,  phiD: 584,  H: 315, E: 440,  F: 500,  L: 470,  K: 398, nPhiD: '12-Φ10', zPhiD1: '4-Φ12', motorMax: '112M' },
  { size: 560,  phiD2: 560,  phiD1: 629,  phiD: 664,  H: 345, E: 500,  F: 560,  L: 700,  K: 626, nPhiD: '16-Φ12', zPhiD1: '4-Φ18', motorMax: '132M' },
  { size: 630,  phiD2: 633,  phiD1: 698,  phiD: 734,  H: 400, E: 570,  F: 630,  L: 470,  K: 398, nPhiD: '16-Φ12', zPhiD1: '4-Φ18', motorMax: '112M' },
  { size: 710,  phiD2: 710,  phiD1: 775,  phiD: 814,  H: 450, E: 650,  F: 710,  L: 470,  K: 396, nPhiD: '16-Φ12', zPhiD1: '4-Φ18', motorMax: '112M' },
  { size: 800,  phiD2: 796,  phiD1: 861,  phiD: 904,  H: 500, E: 730,  F: 800,  L: 470,  K: 386, nPhiD: '16-Φ12', zPhiD1: '4-Φ18', motorMax: '112M' },
  { size: 900,  phiD2: 894,  phiD1: 958,  phiD: 1004, H: 580, E: 830,  F: 900,  L: 565,  K: 481, nPhiD: '24-Φ12', zPhiD1: '4-Φ18', motorMax: '132M' },
  { size: 1000, phiD2: 999,  phiD1: 1067, phiD: 1105, H: 630, E: 930,  F: 990,  L: 780,  K: 696, nPhiD: '24-Φ12', zPhiD1: '4-Φ18', motorMax: '180M' },
  { size: 1120, phiD2: 1125, phiD1: 1200, phiD: 1245, H: 690, E: 1050, F: 1110, L: 700,  K: 594, nPhiD: '24-Φ12', zPhiD1: '4-Φ18', motorMax: '160L' },
  { size: 1250, phiD2: 1250, phiD1: 1337, phiD: 1370, H: 750, E: 1180, F: 1240, L: 1000, K: 894, nPhiD: '24-Φ12', zPhiD1: '4-Φ18', motorMax: '280S' },
  { size: 1400, phiD2: 1400, phiD1: 1480, phiD: 1525, H: 850, E: 1330, F: 1390, L: 1000, K: 892, nPhiD: '32-Φ14', zPhiD1: '6-Φ18', motorMax: '280M' },
  { size: 1600, phiD2: 1595, phiD1: 1680, phiD: 1725, H: 930, E: 1530, F: 1590, L: 1000, K: 892, nPhiD: '32-Φ14', zPhiD1: '6-Φ18', motorMax: '315M' },
];

// Generate empty database - users must add their own data
function generateEmptyDatabase(): FanDatabase {
  return {
    logoUrl: '',
    companyName: 'KINAIR',
    contactInfo: {
      email: 'deepak@kineticsgroup.ae',
      phone: '+971544257970',
    },
    fans: [],
    series: [...DEFAULT_SERIES],
    seriesDrawings: [], // Empty by default - each series gets its own when created
    unitPreferences: { ...DEFAULT_UNIT_PREFERENCES },
    motorDatabase: { ...DEFAULT_MOTOR_DATABASE },
    weightDatabase: { ...DEFAULT_WEIGHT_DATABASE },
  };
}

export const emptyFanDatabase = generateEmptyDatabase();

// Fan Laws calculations
export function applyFanLaws(
  originalData: FanPerformancePoint[],
  originalRPM: number,
  newRPM: number,
  originalDensity: number = 1.2,
  newDensity: number = 1.2
): FanPerformancePoint[] {
  const speedRatio = newRPM / originalRPM;
  const densityRatio = newDensity / originalDensity;
  
  return originalData.map(point => ({
    airflow: Math.round(point.airflow * speedRatio),
    staticPressure: Math.round(point.staticPressure * Math.pow(speedRatio, 2) * densityRatio * 10) / 10,
    shaftPower: Math.round(point.shaftPower * Math.pow(speedRatio, 3) * densityRatio * 100) / 100,
    efficiency: (point.totalEfficiency && point.totalEfficiency > 0) ? point.totalEfficiency : point.efficiency, // Use totalEfficiency if available and > 0
    totalEfficiency: point.totalEfficiency,
  }));
}

// Apply fan laws to convert performance data from one pole count to another
export function applyFanLawsForPoles(
  originalData: FanPerformancePoint[],
  referencePoles: number,
  targetPoles: number,
  frequency: Frequency = 50
): FanPerformancePoint[] {
  const referenceRPM = getMotorRPM(referencePoles, frequency);
  const targetRPM = getMotorRPM(targetPoles, frequency);
  return applyFanLaws(originalData, referenceRPM, targetRPM);
}

// Apply acoustic fan law to convert noise data from one pole count to another
// ΔLw = 50 × log₁₀(RPM₂/RPM₁)
export function applyNoiseFanLawsForPoles(
  originalNoise: OctaveBandData,
  referencePoles: number,
  targetPoles: number,
  frequency: Frequency = 50
): OctaveBandData {
  const referenceRPM = getMotorRPM(referencePoles, frequency);
  const targetRPM = getMotorRPM(targetPoles, frequency);
  
  // Acoustic fan law: ΔLw = 50 × log₁₀(N₂/N₁)
  const deltaDB = 50 * Math.log10(targetRPM / referenceRPM);
  
  const applyDelta = (val: number) => Math.round((val + deltaDB) * 10) / 10;
  
  return {
    hz63: applyDelta(originalNoise.hz63),
    hz125: applyDelta(originalNoise.hz125),
    hz250: applyDelta(originalNoise.hz250),
    hz500: applyDelta(originalNoise.hz500),
    hz1k: applyDelta(originalNoise.hz1k),
    hz2k: applyDelta(originalNoise.hz2k),
    hz4k: applyDelta(originalNoise.hz4k),
    hz8k: applyDelta(originalNoise.hz8k),
    overall: applyDelta(originalNoise.overall),
  };
}

// Apply acoustic fan law between two explicit RPM values
export function applyNoiseFanLawsForRPM(
  originalNoise: OctaveBandData,
  referenceRPM: number,
  targetRPM: number
): OctaveBandData {
  if (!referenceRPM || !targetRPM || referenceRPM <= 0 || targetRPM <= 0) return originalNoise;
  const deltaDB = 50 * Math.log10(targetRPM / referenceRPM);
  const applyDelta = (val: number) => Math.round((val + deltaDB) * 10) / 10;
  return {
    hz63: applyDelta(originalNoise.hz63),
    hz125: applyDelta(originalNoise.hz125),
    hz250: applyDelta(originalNoise.hz250),
    hz500: applyDelta(originalNoise.hz500),
    hz1k: applyDelta(originalNoise.hz1k),
    hz2k: applyDelta(originalNoise.hz2k),
    hz4k: applyDelta(originalNoise.hz4k),
    hz8k: applyDelta(originalNoise.hz8k),
    overall: applyDelta(originalNoise.overall),
  };
}

// Apply frequency change using fan laws
export function applyFrequencyChange(
  originalData: FanPerformancePoint[],
  motorPole: number,
  originalFrequency: Frequency,
  newFrequency: Frequency
): FanPerformancePoint[] {
  const originalRPM = getMotorRPM(motorPole, originalFrequency);
  const newRPM = getMotorRPM(motorPole, newFrequency);
  return applyFanLaws(originalData, originalRPM, newRPM);
}

// Calculate air density based on altitude and temperature
export function calculateAirDensity(altitude: number, temperature: number): number {
  // Standard conditions: 20°C, sea level = 1.2 kg/m³
  const standardDensity = 1.2;
  const standardTemp = 293.15; // 20°C in Kelvin
  const tempK = temperature + 273.15;
  
  // Altitude correction (approximate)
  const altitudeFactor = Math.exp(-altitude / 8500);
  
  // Temperature correction
  const tempFactor = standardTemp / tempK;
  
  return Math.round(standardDensity * altitudeFactor * tempFactor * 1000) / 1000;
}

// Temperature limits for insulation and fire ratings
// Class F insulation: up to 50°C
// F300 fire rating: up to 300°C  
// F400 fire rating: up to 400°C
export const TEMPERATURE_LIMITS = {
  CLASS_F_MAX: 50,    // Standard Class F insulation max temperature
  F300_MAX: 300,      // F300 fire rating max temperature
  F400_MAX: 400,      // F400 fire rating max temperature
};

// Determine required fire rating based on temperature
export function getRequiredFireRating(temperature: number): FireClass {
  if (temperature > TEMPERATURE_LIMITS.F300_MAX) {
    return 'F400'; // Temperature above 300°C requires F400
  } else if (temperature > TEMPERATURE_LIMITS.CLASS_F_MAX) {
    return 'F300'; // Temperature above 50°C requires at least F300
  }
  return ''; // Standard Class F is sufficient for ≤50°C
}

// Find optimal fan selection
export interface SelectionCriteria {
  requiredAirflow: number; // CMH
  requiredPressure: number; // Pa
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  fireClass?: FireClass;
  accessory?: AccessoryType; // ET, ID, ETID options
  atexRating?: AtexRating; // ATEX zone rating
  efficiencyClass?: MotorEfficiencyClass; // Motor efficiency class filter (IE2, IE3, IE4)
  safetyFactor?: number;
  frequency?: Frequency;
  motorPole?: number; // undefined means all poles
  motorBrandId?: string; // optional motor brand filter
  series?: FanSeries;
  seriesId?: string; // UUID for filtering by series
  toleranceMin?: number; // percentage, e.g., 0 for 0%
  toleranceMax?: number; // percentage, e.g., 1000 for 1000%
  airDensity?: number; // actual air density in kg/m³ (standard is 1.2)
  temperature?: number; // operating temperature in °C
  dimensionsBySeriesAndSize?: Map<string, FanDimension>; // key: `${seriesId}-${size}`
}

export interface FanSelection {
  fanId: string;
  diameter: number;
  bladeCount: number;
  bladeAngle: number;
  motorPole: number;
  operatingPoint: FanPerformancePoint;
  dutyPointMatch: number; // percentage
  noiseData: OctaveBandData;
  score: number; // lower is better
  motorRating: number; // kW
  nomenclature: string;
  nomenclatureTemplate?: string; // For generating dynamic descriptions
  fireClass: FireClass;
  accessory: AccessoryType; // ET, ID, ETID options
  atexRating: AtexRating; // ATEX zone rating
  frequency: Frequency;
  series: FanSeries;
  seriesId?: string; // UUID for looking up dimensions
  motorBrandId?: string; // selected motor brand
  requiredAirflow: number; // Store the required values for display
  requiredPressure: number;
}

export function findOptimalSelections(
  database: FanDatabase,
  criteria: SelectionCriteria,
  maxResults: number = 20
): FanSelection[] {
  const selections: FanSelection[] = [];
  
  // Convert to base units (CMH, Pa)
  const targetAirflow = criteria.requiredAirflow / AIRFLOW_UNITS[criteria.airflowUnit].factor;
  const targetPressure = criteria.requiredPressure / PRESSURE_UNITS[criteria.pressureUnit].factor;
  const safetyFactor = criteria.safetyFactor || 1.15;
  const frequency = criteria.frequency || 50;
  const toleranceMin = (criteria.toleranceMin ?? 95) / 100; // Convert percentage to decimal
  const toleranceMax = (criteria.toleranceMax ?? 110) / 100;
  
  // Fire class is manually selected by user (not auto-determined)
  // Motor selection is done at standard density (1.2 kg/m³) for worst-case/higher side
  const fireClass = criteria.fireClass || '';
  
  // Air density correction factor for performance calculations
  // Standard density = 1.2 kg/m³, actual density from user input
  const standardDensity = 1.2;
  const actualDensity = criteria.airDensity || standardDensity;
  const densityRatio = actualDensity / standardDensity;
  
  // Skip if no valid target values
  if (targetAirflow <= 0 || targetPressure <= 0) {
    return [];
  }
  
  // Determine which motor poles to check
  const polesToCheck = criteria.motorPole ? [criteria.motorPole] : MOTOR_POLES;
  
  database.fans.forEach(fan => {
    // Filter by series if specified - match by seriesId (UUID) if available, otherwise by name
    if (criteria.seriesId && criteria.seriesId !== 'all') {
      // Use seriesId for filtering (more reliable)
      const fanSeriesId = (fan as any).seriesId;
      if (fanSeriesId !== criteria.seriesId) {
        return;
      }
    } else if (criteria.series && criteria.series !== 'all') {
      // Fallback to series name
      if (fan.series !== criteria.series) {
        return;
      }
    }
    
    fan.bladeConfigurations.forEach(config => {
      config.bladeAngles.forEach(angle => {
        // Check all specified motor poles
        polesToCheck.forEach(motorPole => {
          // Only check poles that the fan supports
          if (!fan.motorPoles.includes(motorPole)) {
            if (fan.series === 'KVF-M') {
              console.log(`KVF-M ${fan.diameter}: Skipped - pole ${motorPole} not in ${JSON.stringify(fan.motorPoles)}`);
            }
            return;
          }
          
          let perfData = config.performanceData[angle];
          if (!perfData) {
            if (fan.series === 'KVF-M') {
              console.log(`KVF-M ${fan.diameter}: No perf data for angle ${angle}`);
            }
            return;
          }
          // Get the reference poles for this fan (base data pole count)
          // Default to the first motor pole if referencePoles is not set
          const referencePoles = (fan as any).referencePoles || fan.motorPoles[0] || 4;
          
          // Apply fan laws if motor pole differs from reference poles
          // IMPORTANT: Use 50Hz for pole conversion since data is stored at 50Hz base
          // Frequency adjustment is applied separately in the next step
          if (motorPole !== referencePoles) {
            perfData = applyFanLawsForPoles(perfData, referencePoles, motorPole, 50);
          }
          
          // Apply frequency adjustment if not 50Hz
          // This scales the already pole-adjusted data from 50Hz to the target frequency
          if (frequency !== 50) {
            perfData = applyFrequencyChange(perfData, motorPole, 50, frequency);
          }
          
          // Find the operating point by interpolating on the fan curve at the required airflow
          // Sort performance data by airflow - include zero airflow points (shut-off) for centrifugal/mixed flow fans
          // Only filter out points where BOTH airflow and pressure are zero (truly empty data)
          const sortedPerfData = [...perfData]
            .filter(p => p.airflow >= 0 && p.staticPressure >= 0 && !(p.airflow === 0 && p.staticPressure === 0))
            .sort((a, b) => a.airflow - b.airflow);
          
          // Need at least 1 data point
          if (sortedPerfData.length === 0) {
            if (fan.series === 'KVF-M') {
              console.log(`KVF-M ${fan.diameter}: No valid perf data after filtering (pole ${motorPole})`);
            }
            return;
          }
          
          // Check if target airflow is within the fan's operating range
          const minAirflow = sortedPerfData[0].airflow;
          const maxAirflow = sortedPerfData[sortedPerfData.length - 1].airflow;
          
          if (fan.series === 'KVF-M') {
            console.log(`KVF-M ${fan.diameter}: Pole ${motorPole}, Range ${minAirflow}-${maxAirflow} CMH, Target ${targetAirflow} CMH`);
          }
          
          // Interpolate to find pressure, power, and efficiency at target airflow
          let interpolatedPoint: FanPerformancePoint | null = null;
          
          // Single-point data (simplified mode) - check if target is within tolerance of that point
          if (sortedPerfData.length === 1) {
            const singlePoint = sortedPerfData[0];
            // For single-point data, check if target is within tolerance range
            if (targetAirflow >= singlePoint.airflow * toleranceMin && 
                targetAirflow <= singlePoint.airflow * toleranceMax) {
              // Use proportional scaling for single-point data
              const airflowRatio = targetAirflow / singlePoint.airflow;
              interpolatedPoint = {
                airflow: Math.round(targetAirflow),
                // Pressure scales inversely with airflow squared (fan affinity laws approximation)
                staticPressure: Math.round(singlePoint.staticPressure * Math.pow(1 / airflowRatio, 2) * 10) / 10,
                shaftPower: singlePoint.shaftPower > 0 ? Math.round(singlePoint.shaftPower * airflowRatio * 1000) / 1000 : 0,
                efficiency: singlePoint.totalEfficiency || singlePoint.efficiency || 0,
              };
            }
          } else {
            // Multi-point data - use interpolation
            if (targetAirflow < minAirflow * toleranceMin || targetAirflow > maxAirflow * toleranceMax) {
              if (fan.series === 'KVF-M') {
                console.log(`KVF-M ${fan.diameter}: Target ${targetAirflow} outside range ${minAirflow * toleranceMin}-${maxAirflow * toleranceMax}`);
              }
              return; // Target airflow is outside fan's range
            }
            
            for (let i = 0; i < sortedPerfData.length - 1; i++) {
              const p1 = sortedPerfData[i];
              const p2 = sortedPerfData[i + 1];
              
              if (targetAirflow >= p1.airflow && targetAirflow <= p2.airflow) {
                const ratio = (targetAirflow - p1.airflow) / (p2.airflow - p1.airflow);
                
                const eff1 = (p1.totalEfficiency && p1.totalEfficiency > 0) ? p1.totalEfficiency : p1.efficiency;
                const eff2 = (p2.totalEfficiency && p2.totalEfficiency > 0) ? p2.totalEfficiency : p2.efficiency;
                interpolatedPoint = {
                  airflow: Math.round(targetAirflow),
                  staticPressure: Math.round((p1.staticPressure + ratio * (p2.staticPressure - p1.staticPressure)) * 10) / 10,
                  shaftPower: Math.round((p1.shaftPower + ratio * (p2.shaftPower - p1.shaftPower)) * 1000) / 1000,
                  efficiency: Math.round((eff1 + ratio * (eff2 - eff1)) * 10) / 10,
                };
                break;
              }
            }
          }
          
          // If target is beyond max airflow but within tolerance, extrapolate from last two points
          if (!interpolatedPoint && targetAirflow > maxAirflow && targetAirflow <= maxAirflow * toleranceMax) {
            const n = sortedPerfData.length;
            const p1 = sortedPerfData[n - 2];
            const p2 = sortedPerfData[n - 1];
            const ratio = (targetAirflow - p1.airflow) / (p2.airflow - p1.airflow);
            
            const eff1 = (p1.totalEfficiency && p1.totalEfficiency > 0) ? p1.totalEfficiency : p1.efficiency;
            const eff2 = (p2.totalEfficiency && p2.totalEfficiency > 0) ? p2.totalEfficiency : p2.efficiency;
            interpolatedPoint = {
              airflow: Math.round(targetAirflow),
              staticPressure: Math.max(0, Math.round((p1.staticPressure + ratio * (p2.staticPressure - p1.staticPressure)) * 10) / 10),
              shaftPower: Math.round((p1.shaftPower + ratio * (p2.shaftPower - p1.shaftPower)) * 1000) / 1000,
              efficiency: Math.max(0, Math.round((eff1 + ratio * (eff2 - eff1)) * 10) / 10),
            };
          }
          
          // If target is below min airflow but within tolerance, extrapolate from first two points
          if (!interpolatedPoint && targetAirflow < minAirflow && targetAirflow >= minAirflow * toleranceMin) {
            const p1 = sortedPerfData[0];
            const p2 = sortedPerfData[1];
            const ratio = (targetAirflow - p1.airflow) / (p2.airflow - p1.airflow);
            
            const eff1 = (p1.totalEfficiency && p1.totalEfficiency > 0) ? p1.totalEfficiency : p1.efficiency;
            const eff2 = (p2.totalEfficiency && p2.totalEfficiency > 0) ? p2.totalEfficiency : p2.efficiency;
            interpolatedPoint = {
              airflow: Math.round(targetAirflow),
              staticPressure: Math.round((p1.staticPressure + ratio * (p2.staticPressure - p1.staticPressure)) * 10) / 10,
              shaftPower: Math.max(0, Math.round((p1.shaftPower + ratio * (p2.shaftPower - p1.shaftPower)) * 1000) / 1000),
              efficiency: Math.max(0, Math.round((eff1 + ratio * (eff2 - eff1)) * 10) / 10),
            };
          }
          
          if (!interpolatedPoint) return;
          
          // Density correction explanation:
          // Fan catalog data is at standard density (1.2 kg/m³)
          // When actual density differs:
          // - Pressure output changes proportionally (lower density = lower pressure)
          // - Power consumption changes proportionally (lower density = lower power)
          // - Volumetric airflow stays the same
          // 
          // For MOTOR SELECTION: Always use standard 1.2 kg/m³ for worst-case sizing
          // The motor must handle max power which occurs at standard/higher density
          // 
          // For OPERATING POINT: Apply density correction to show actual conditions
          
          const correctedPressure = Math.round(interpolatedPoint.staticPressure * densityRatio * 10) / 10;
          const correctedPower = Math.round(interpolatedPoint.shaftPower * densityRatio * 1000) / 1000;

          // Fallback: if no efficiency was entered in the performance data, derive
          // TOTAL efficiency from airflow, total pressure (static + dynamic) and shaft power
          let effValue = interpolatedPoint.efficiency;
          if ((!effValue || effValue <= 0) && correctedPower > 0 && correctedPressure > 0) {
            const areaM2 = Math.PI * Math.pow(fan.diameter / 1000 / 2, 2);
            const airflowCMS = interpolatedPoint.airflow / 3600;
            const velocity = areaM2 > 0 ? airflowCMS / areaM2 : 0;
            const dynamicPressure = 0.5 * (actualDensity || 1.2) * Math.pow(velocity, 2);
            const totalPressure = correctedPressure + dynamicPressure;
            const calc = (airflowCMS * totalPressure) / (correctedPower * 1000) * 100;
            if (isFinite(calc) && calc > 0) {
              effValue = Math.round(Math.min(calc, 100) * 10) / 10;
            }
          }


          const densityCorrectedPoint: FanPerformancePoint = {
            airflow: interpolatedPoint.airflow,
            staticPressure: correctedPressure,
            shaftPower: correctedPower,
            efficiency: effValue,
          };

          
          // Check if fan can deliver required pressure at actual density conditions
          const pressureRatio = densityCorrectedPoint.staticPressure / targetPressure;
          
          if (pressureRatio < toleranceMin) {
            if (fan.series === 'KVF-M') {
              console.log(`KVF-M ${fan.diameter}: Pressure ratio ${pressureRatio.toFixed(2)} below tolerance ${toleranceMin} (fan: ${densityCorrectedPoint.staticPressure} Pa, target: ${targetPressure} Pa)`);
            }
            return; // Fan cannot deliver required pressure at this airflow
          }
          
          // Use density-corrected point for display (actual operating conditions)
          let bestMatch = densityCorrectedPoint;
          let dutyPointMatch = Math.round(pressureRatio * 100 * 10) / 10;
          let oversizeFactor = 0;

          if (pressureRatio > toleranceMax) {
            // Oversized fan: it still serves the duty, it simply runs further right
            // on its curve. The real operating point is where the SYSTEM curve
            // (k = Preq / Qreq²) crosses the fan curve, so the duty point and the
            // system curve stay consistent instead of sitting above the requirement.
            const k = targetPressure / (targetAirflow * targetAirflow);
            let intersection: FanPerformancePoint | null = null;

            for (let i = 0; i < sortedPerfData.length - 1; i++) {
              const p1 = sortedPerfData[i];
              const p2 = sortedPerfData[i + 1];
              const f1 = p1.staticPressure * densityRatio - k * p1.airflow * p1.airflow;
              const f2 = p2.staticPressure * densityRatio - k * p2.airflow * p2.airflow;

              if (f1 === 0 || (f1 > 0) !== (f2 > 0)) {
                const t = f1 === f2 ? 0 : f1 / (f1 - f2);
                const q = p1.airflow + t * (p2.airflow - p1.airflow);
                if (q <= 0) continue;
                const e1 = (p1.totalEfficiency && p1.totalEfficiency > 0) ? p1.totalEfficiency : p1.efficiency;
                const e2 = (p2.totalEfficiency && p2.totalEfficiency > 0) ? p2.totalEfficiency : p2.efficiency;
                intersection = {
                  airflow: Math.round(q),
                  staticPressure: Math.round(k * q * q * 10) / 10,
                  shaftPower: Math.round((p1.shaftPower + t * (p2.shaftPower - p1.shaftPower)) * densityRatio * 1000) / 1000,
                  efficiency: Math.round((e1 + t * (e2 - e1)) * 10) / 10,
                };
                break;
              }
            }

            if (!intersection) return; // System curve never crosses this fan curve

            bestMatch = intersection;
            dutyPointMatch = 100;
            oversizeFactor = targetAirflow > 0 ? Math.max(0, intersection.airflow / targetAirflow - 1) : 0;
          }
          
          if (fan.series === 'KVF-M') {
            console.log(`KVF-M ${fan.diameter}: ✓ PASSED - Adding to selections (pressure ratio: ${pressureRatio.toFixed(2)})`);
          }
          
          // MOTOR SELECTION: Use STANDARD DENSITY (1.2 kg/m³) power for worst-case sizing
          // This ensures motor is sized for maximum power draw
          const motorSelectionPower = densityRatio > 0 ? bestMatch.shaftPower / densityRatio : bestMatch.shaftPower; // At standard 1.2 kg/m³

          const motorRating = calculateMotorRating(motorSelectionPower, safetyFactor);
          // Find the series info to get nomenclature template
          const seriesInfo = database.series.find(s => s.id === (fan as any).seriesId || s.name === fan.series);
          const nomenclatureTemplate = seriesInfo?.nomenclatureTemplate;
          const accessory = criteria.accessory || '';
          const atexRating = criteria.atexRating || '';
          const nomenclature = generateNomenclature(motorPole, fan.diameter, config.bladeCount, angle, motorRating, fireClass, nomenclatureTemplate, fan.series, accessory, atexRating);
          
          // Score based on optimization priority (COST OPTIMIZATION):
          // 1. Must meet duty point (>=100%) - underperforming gets heavy penalty
          // 2. Lowest casing diameter (smallest/cheapest fan first) - PRIMARY factor
          // 3. Lowest motor rating (smallest motor)
          // 4. Lowest motor pole (2P > 4P > 6P > 8P > 12P)
          // If duty point is met (>=100%), exceeding is OK - prioritize smaller/cheaper fan
          const isUnderPerforming = dutyPointMatch < 100;
          const dutyPointDeviation = Math.abs(dutyPointMatch - 100);
          const dutyPointPenalty = isUnderPerforming 
            ? (dutyPointDeviation * 100) + 100000  // Heavy penalty for underperforming fans
            : (dutyPointDeviation * 0.1);           // Minimal penalty for exceeding - higher is fine
          const score = 
            dutyPointPenalty +                    // Must meet duty point
            (oversizeFactor * 200) +              // Slight penalty when the fan overshoots the duty
            (fan.diameter * 10) +                 // PRIMARY: Smallest diameter first (400mm=4000, 800mm=8000)
            (motorRating * 50) +                  // Smaller motor rating preferred
            (motorPole * 5);                      // Lower pole count preferred (2P=10, 4P=20, 6P=30...)

          
          // Motor matching with STRICT fire rating filter and model locking priority
          // Priority: Model-locked motors > Series-locked motors > Universal motors
          // F400 → only F400 motors, F300 → only F300 motors, Normal → only normal motors (no fire rating)
          const requiredMotorPower = motorSelectionPower * safetyFactor;
          
          // Lock helpers: support multi-select arrays with legacy single-id fallback
          const lockedSeriesIds = (spec: any): string[] => {
            const arr = Array.isArray(spec.series_ids) ? spec.series_ids.filter(Boolean) : [];
            if (arr.length) return arr;
            return spec.series_id ? [spec.series_id] : [];
          };
          const lockedModelIds = (spec: any): string[] => {
            const arr = Array.isArray(spec.model_ids) ? spec.model_ids.filter(Boolean) : [];
            if (arr.length) return arr;
            return spec.model_id ? [spec.model_id] : [];
          };

          // First, try to find the smallest adequately-sized motor locked to this model.
          // A model may be checked on several ratings, so array order must not decide the motor.
          const modelLockedCandidates = database.motorDatabase.specifications.filter(spec => {
            const modelIds = lockedModelIds(spec);

            // Must be locked to THIS specific model
            if (!modelIds.includes(fan.id)) {
              return false;
            }

            
            // Check poles match
            if (spec.motorPoles !== motorPole) return false;
            
            // Strict fire rating matching
            let matchesFireRating = false;
            if (fireClass === 'F400') {
              matchesFireRating = spec.fireRating === 'F400';
            } else if (fireClass === 'F300') {
              matchesFireRating = spec.fireRating === 'F300';
            } else {
              matchesFireRating = !spec.fireRating;
            }
            
            // Check efficiency class if specified
            if (criteria.efficiencyClass && spec.efficiencyClass !== criteria.efficiencyClass) {
              return false;
            }
            
            if (criteria.motorBrandId) {
              return matchesFireRating && spec.brandId === criteria.motorBrandId;
            }
            return matchesFireRating;
          }).sort((a, b) => a.ratingKW - b.ratingKW);

          // Prefer the smallest motor that covers shaft power x safety factor.
          // If the model's own locked motor(s) are rated at/near the fan's absorbed
          // power (typical for small plate/compact fans), fall back to the smallest
          // motor covering the raw shaft power, then to the largest locked motor,
          // instead of dropping the fan from the results entirely.
          let matchingMotor =
            modelLockedCandidates.find(spec => spec.ratingKW >= requiredMotorPower) ||
            modelLockedCandidates.find(spec => spec.ratingKW >= motorSelectionPower) ||
            modelLockedCandidates[modelLockedCandidates.length - 1];

          
          // If no model-locked motor, try series-locked motors
          if (!matchingMotor) {
            matchingMotor = database.motorDatabase.specifications.find(spec => {
              const seriesIds = lockedSeriesIds(spec);
              const modelIds = lockedModelIds(spec);

              // Must be locked to THIS series but not to specific models
              if (modelIds.length > 0 || !seriesIds.includes((fan as any).seriesId)) {
                return false;
              }

              
              // Standard power matching for series-locked
              const matchesPoleAndRating = spec.motorPoles === motorPole && spec.ratingKW >= requiredMotorPower;
              
              let matchesFireRating = false;
              if (fireClass === 'F400') {
                matchesFireRating = spec.fireRating === 'F400';
              } else if (fireClass === 'F300') {
                matchesFireRating = spec.fireRating === 'F300';
              } else {
                matchesFireRating = !spec.fireRating;
              }
              
              // Check efficiency class if specified
              if (criteria.efficiencyClass && spec.efficiencyClass !== criteria.efficiencyClass) {
                return false;
              }
              
              if (criteria.motorBrandId) {
                return matchesPoleAndRating && matchesFireRating && spec.brandId === criteria.motorBrandId;
              }
              return matchesPoleAndRating && matchesFireRating;
            });
          }
          
          // If no locked motors found, fall back to universal motors
          if (!matchingMotor) {
            matchingMotor = database.motorDatabase.specifications.find(spec => {
              // Must be universal (no series or model lock)
              if (lockedSeriesIds(spec).length > 0 || lockedModelIds(spec).length > 0) {
                return false;
              }

              
              const matchesPoleAndRating = spec.motorPoles === motorPole && spec.ratingKW >= requiredMotorPower;
              
              let matchesFireRating = false;
              if (fireClass === 'F400') {
                matchesFireRating = spec.fireRating === 'F400';
              } else if (fireClass === 'F300') {
                matchesFireRating = spec.fireRating === 'F300';
              } else {
                matchesFireRating = !spec.fireRating;
              }
              
              // Check efficiency class if specified
              if (criteria.efficiencyClass && spec.efficiencyClass !== criteria.efficiencyClass) {
                return false;
              }
              
              if (criteria.motorBrandId) {
                return matchesPoleAndRating && matchesFireRating && spec.brandId === criteria.motorBrandId;
              }
              return matchesPoleAndRating && matchesFireRating;
            });
          }
          
          if (!matchingMotor) return;
          
          // Use the matched motor's actual rating
          const actualMotorRating = matchingMotor.ratingKW;
          
          // Get noise data and scale it for the selected motor pole
          // IMPORTANT: Use 50Hz for pole conversion since data is stored at 50Hz base
          let noiseData = config.noiseData[angle];
          if (noiseData && motorPole !== referencePoles) {
            noiseData = applyNoiseFanLawsForPoles(noiseData, referencePoles, motorPole, 50);
          }
          // Apply frequency adjustment to noise if not 50Hz
          if (noiseData && frequency !== 50) {
            const originalRPM = getMotorRPM(motorPole, 50);
            const newRPM = getMotorRPM(motorPole, frequency);
            const deltaDB = 50 * Math.log10(newRPM / originalRPM);
            const applyDelta = (val: number) => Math.round((val + deltaDB) * 10) / 10;
            noiseData = {
              hz63: applyDelta(noiseData.hz63),
              hz125: applyDelta(noiseData.hz125),
              hz250: applyDelta(noiseData.hz250),
              hz500: applyDelta(noiseData.hz500),
              hz1k: applyDelta(noiseData.hz1k),
              hz2k: applyDelta(noiseData.hz2k),
              hz4k: applyDelta(noiseData.hz4k),
              hz8k: applyDelta(noiseData.hz8k),
              overall: applyDelta(noiseData.overall),
            };
          }
          
          // Regenerate nomenclature with actual motor rating
          const actualNomenclature = generateNomenclature(motorPole, fan.diameter, config.bladeCount, angle, actualMotorRating, fireClass, nomenclatureTemplate, fan.series, accessory, atexRating);
          
          selections.push({
            fanId: fan.id,
            diameter: fan.diameter,
            bladeCount: config.bladeCount,
            bladeAngle: angle,
            motorPole,
            operatingPoint: bestMatch,
            dutyPointMatch,
            noiseData,
            score,
            motorRating: actualMotorRating, // Use actual matched motor rating
            nomenclature: actualNomenclature,
            nomenclatureTemplate, // Include template for dynamic description generation
            fireClass: fireClass,
            accessory, // Include accessory type
            atexRating, // Include ATEX rating
            frequency,
            series: fan.series,
            seriesId: (fan as any).seriesId, // Include series ID for dimension lookup
            motorBrandId: criteria.motorBrandId,
            requiredAirflow: targetAirflow,
            requiredPressure: targetPressure,
          });
        });
      });
    });
  });
  
  // Filter out invalid selections, deduplicate, and sort by score
  const validSelections = selections.filter(s => 
    s.operatingPoint.airflow > 0 && 
    s.operatingPoint.staticPressure > 0 &&
    s.dutyPointMatch > 0
  );
  
  // Deduplicate: keep only the best (lowest score) entry for each unique fan configuration
  const dedupeMap = new Map<string, FanSelection>();
  validSelections.forEach(sel => {
    const key = `${sel.fanId}-${sel.bladeCount}-${sel.bladeAngle}-${sel.motorPole}`;
    const existing = dedupeMap.get(key);
    if (!existing || sel.score < existing.score) {
      dedupeMap.set(key, sel);
    }
  });
  
  return Array.from(dedupeMap.values())
    .sort((a, b) => a.score - b.score)
    .slice(0, maxResults);
}

// Snap values that are within floating-point noise of a round number
function snapValue(value: number, decimals: number): number {
  const tolerance = Math.max(Math.abs(value) * 1e-4, 1e-9);
  const nearestInt = Math.round(value);
  if (Math.abs(value - nearestInt) <= tolerance) return nearestInt;
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

// Convert airflow between units
export function convertAirflow(value: number, fromUnit: keyof typeof AIRFLOW_UNITS, toUnit: keyof typeof AIRFLOW_UNITS): number {
  if (fromUnit === toUnit) return value;
  const baseValue = value / AIRFLOW_UNITS[fromUnit].factor;
  return snapValue(baseValue * AIRFLOW_UNITS[toUnit].factor, 2);
}

// Total efficiency (%) from airflow (CMH), static pressure (Pa), shaft power (kW)
// and fan diameter (mm). Total pressure = static + dynamic (outlet velocity pressure).
export function calculateTotalEfficiency(
  airflowCMH: number,
  staticPressurePa: number,
  shaftPowerKW: number,
  diameterMM: number,
  density = 1.2
): number | undefined {
  if (!(airflowCMH > 0) || !(staticPressurePa > 0) || !(shaftPowerKW > 0) || !(diameterMM > 0)) return undefined;
  const areaM2 = Math.PI * Math.pow(diameterMM / 1000 / 2, 2);
  const airflowCMS = airflowCMH / 3600;
  const velocity = areaM2 > 0 ? airflowCMS / areaM2 : 0;
  const dynamicPressure = 0.5 * (density || 1.2) * Math.pow(velocity, 2);
  const totalPressure = staticPressurePa + dynamicPressure;
  const eff = (airflowCMS * totalPressure) / (shaftPowerKW * 1000) * 100;
  if (!isFinite(eff) || eff <= 0) return undefined;
  return Math.round(Math.min(eff, 100) * 10) / 10;
}



// Convert pressure between units
export function convertPressure(value: number, fromUnit: keyof typeof PRESSURE_UNITS, toUnit: keyof typeof PRESSURE_UNITS): number {
  if (fromUnit === toUnit) return value;
  const baseValue = value / PRESSURE_UNITS[fromUnit].factor;
  return snapValue(baseValue * PRESSURE_UNITS[toUnit].factor, 3);
}

// Display helpers - keep engineering values clean (no 2499.99 artifacts)
const AIRFLOW_DECIMALS: Record<keyof typeof AIRFLOW_UNITS, number> = {
  CMH: 0,
  LPS: 0,
  CFM: 0,
  CMS: 3,
};

const PRESSURE_DECIMALS: Record<keyof typeof PRESSURE_UNITS, number> = {
  Pa: 0,
  inwg: 3,
  mmwg: 1,
};

export function roundAirflowForDisplay(value: number, unit: keyof typeof AIRFLOW_UNITS): number {
  const f = Math.pow(10, AIRFLOW_DECIMALS[unit] ?? 0);
  return Math.round(value * f) / f;
}

export function roundPressureForDisplay(value: number, unit: keyof typeof PRESSURE_UNITS): number {
  const f = Math.pow(10, PRESSURE_DECIMALS[unit] ?? 0);
  return Math.round(value * f) / f;
}

export function formatAirflow(value: number, fromUnit: keyof typeof AIRFLOW_UNITS, toUnit: keyof typeof AIRFLOW_UNITS): string {
  const converted = roundAirflowForDisplay(convertAirflow(value, fromUnit, toUnit), toUnit);
  return converted.toLocaleString(undefined, { maximumFractionDigits: AIRFLOW_DECIMALS[toUnit] ?? 0 });
}

export function formatPressure(value: number, fromUnit: keyof typeof PRESSURE_UNITS, toUnit: keyof typeof PRESSURE_UNITS): string {
  const converted = roundPressureForDisplay(convertPressure(value, fromUnit, toUnit), toUnit);
  return converted.toLocaleString(undefined, {
    minimumFractionDigits: PRESSURE_DECIMALS[toUnit] ?? 0,
    maximumFractionDigits: PRESSURE_DECIMALS[toUnit] ?? 0,
  });
}


// Generate sample CSV format for fan data export/import
export function generateSampleCSVFormat(): string {
  const headers = [
    'Fan_ID',
    'Diameter_mm',
    'Blade_Count',
    'Blade_Angle',
    'Application_Type',
    'Point_Index',
    'Airflow_CMH',
    'Static_Pressure_Pa',
    'Shaft_Power_kW',
    'Efficiency_Percent',
    'Noise_63Hz',
    'Noise_125Hz',
    'Noise_250Hz',
    'Noise_500Hz',
    'Noise_1kHz',
    'Noise_2kHz',
    'Noise_4kHz',
    'Noise_8kHz',
    'Noise_Overall'
  ];
  
  // Generate sample rows
  const sampleRows = [
    'KAF-315,315,4,20,ducted,1,0,180.5,0.15,25.5,75,72,68,65,63,60,57,54,83',
    'KAF-315,315,4,20,ducted,2,1500,175.0,0.22,45.2,75,72,68,65,63,60,57,54,83',
    'KAF-315,315,4,20,ducted,3,3000,165.5,0.31,58.4,75,72,68,65,63,60,57,54,83',
    '# ... (12 points per blade angle per blade count per fan)',
    '# Application_Type options: ducted, wall_mounted, roof_mounted',
  ];
  
  return [headers.join(','), ...sampleRows].join('\n');
}

// Parse CSV data to fan models
export function parseCSVToFanData(csvContent: string): Partial<FanModel>[] {
  const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  const headers = lines[0].split(',').map(h => h.trim());
  
  const fanDataMap: { [key: string]: Partial<FanModel> } = {};
  
  lines.slice(1).forEach(line => {
    const values = line.split(',').map(v => v.trim());
    const row: { [key: string]: string } = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    
    const fanId = row['Fan_ID'];
    const diameter = parseInt(row['Diameter_mm']);
    const bladeCount = parseInt(row['Blade_Count']);
    const bladeAngle = parseInt(row['Blade_Angle']);
    const series = row['Series'] as FanSeries;
    
    if (!fanDataMap[fanId]) {
      fanDataMap[fanId] = {
        id: fanId,
        diameter,
        motorPoles: MOTOR_POLES,
        bladeConfigurations: [],
        series: series || 'KAF',
      };
    }
    
    // This is a simplified parser - in production, would need more robust handling
  });
  
  return Object.values(fanDataMap);
}
