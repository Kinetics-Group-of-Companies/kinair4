// Fan dimension data based on diameter
export interface FanDimensions {
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

export const FAN_DIMENSIONS: FanDimensions[] = [
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

export function getDimensionsForSize(size: number): FanDimensions | undefined {
  return FAN_DIMENSIONS.find(d => d.size === size);
}
