// Fan Laws calculations for motor poles
import { FanPerformancePoint, OctaveBandData, Frequency, getMotorRPM } from './fanData';

/**
 * Apply fan laws to convert performance data from one RPM to another
 */
export function applyFanLawsForPoles(
  originalData: FanPerformancePoint[],
  referencePoles: number,
  targetPoles: number,
  frequency: Frequency = 50
): FanPerformancePoint[] {
  const referenceRPM = getMotorRPM(referencePoles, frequency);
  const targetRPM = getMotorRPM(targetPoles, frequency);
  const speedRatio = targetRPM / referenceRPM;
  
  return originalData.map(point => ({
    airflow: Math.round(point.airflow * speedRatio),
    staticPressure: Math.round(point.staticPressure * Math.pow(speedRatio, 2) * 10) / 10,
    shaftPower: Math.round(point.shaftPower * Math.pow(speedRatio, 3) * 1000) / 1000,
    efficiency: point.efficiency, // Efficiency remains approximately constant
  }));
}

/**
 * Apply acoustic fan law to convert noise data from one RPM to another
 * ΔLw = 50 × log₁₀(RPM₂/RPM₁)
 */
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

/**
 * Get RPM info string for display
 */
export function getRPMInfo(poles: number, frequency: Frequency = 50): string {
  const rpm = getMotorRPM(poles, frequency);
  return `${poles}P @ ${frequency}Hz = ${rpm} RPM`;
}
