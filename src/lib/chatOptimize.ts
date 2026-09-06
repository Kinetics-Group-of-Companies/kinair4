import type { FanSelection } from './fanData';
import type { AirCurtainSelection } from './airCurtainData';

/**
 * Add-on layer: re-ranks results that already came out of the official
 * selection engines, according to what the user asked the AI for.
 * Nothing in the selection engines is changed.
 */

export type FanOptimizeFor =
  | 'balanced'
  | 'low_noise'
  | 'high_efficiency'
  | 'low_power'
  | 'max_airflow'
  | 'max_pressure'
  | 'smallest_size';

export const FAN_OPTIMIZE_LABEL: Record<FanOptimizeFor, string> = {
  balanced: 'best overall match',
  low_noise: 'lowest noise',
  high_efficiency: 'highest total efficiency',
  low_power: 'lowest absorbed power',
  max_airflow: 'highest airflow',
  max_pressure: 'highest static pressure',
  smallest_size: 'smallest casing size',
};

export function rankFanSelections(
  results: FanSelection[],
  optimizeFor: FanOptimizeFor = 'balanced',
): FanSelection[] {
  const list = [...results];
  const noise = (s: FanSelection) => s.noiseData?.overall ?? Number.POSITIVE_INFINITY;
  switch (optimizeFor) {
    case 'low_noise':
      return list.sort((a, b) => noise(a) - noise(b) || a.score - b.score);
    case 'high_efficiency':
      return list.sort(
        (a, b) =>
          (b.operatingPoint.efficiency ?? 0) - (a.operatingPoint.efficiency ?? 0) || a.score - b.score,
      );
    case 'low_power':
      return list.sort(
        (a, b) =>
          (a.operatingPoint.shaftPower ?? Infinity) - (b.operatingPoint.shaftPower ?? Infinity) ||
          a.score - b.score,
      );
    case 'max_airflow':
      return list.sort((a, b) => b.operatingPoint.airflow - a.operatingPoint.airflow || a.score - b.score);
    case 'max_pressure':
      return list.sort(
        (a, b) => b.operatingPoint.staticPressure - a.operatingPoint.staticPressure || a.score - b.score,
      );
    case 'smallest_size':
      return list.sort((a, b) => a.diameter - b.diameter || a.score - b.score);
    default:
      return list;
  }
}

export type AcOptimizeFor =
  | 'balanced'
  | 'low_power'
  | 'low_noise'
  | 'max_airflow'
  | 'max_velocity'
  | 'fewest_units';

export const AC_OPTIMIZE_LABEL: Record<AcOptimizeFor, string> = {
  balanced: 'best overall match',
  low_power: 'lowest power consumption',
  low_noise: 'lowest noise',
  max_airflow: 'highest airflow',
  max_velocity: 'strongest air barrier',
  fewest_units: 'fewest units',
};

export function rankAirCurtains(
  results: AirCurtainSelection[],
  optimizeFor: AcOptimizeFor = 'balanced',
): AirCurtainSelection[] {
  const list = [...results];
  switch (optimizeFor) {
    case 'low_power':
      return list.sort((a, b) => (a.totalPowerW ?? Infinity) - (b.totalPowerW ?? Infinity));
    case 'low_noise':
      return list.sort((a, b) => (a.noiseDb ?? Infinity) - (b.noiseDb ?? Infinity));
    case 'max_airflow':
      return list.sort((a, b) => b.totalAirVolumeCmh - a.totalAirVolumeCmh);
    case 'max_velocity':
      return list.sort((a, b) => b.floorVelocity - a.floorVelocity);
    case 'fewest_units':
      return list.sort((a, b) => a.unitsRequired - b.unitsRequired || b.matchPercent - a.matchPercent);
    default:
      return list;
  }
}
