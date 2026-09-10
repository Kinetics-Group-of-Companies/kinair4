// Air curtain catalogue types + selection engine.
// Kept fully separate from the axial/centrifugal fan selection engine.

export type AirCurtainCategory = 'surface' | 'recessed';
export type AirCurtainSpeed = 'high' | 'medium' | 'low';
export type AirCurtainMotorType = 'AC' | 'EC';

export interface AirCurtainModel {
  id: string;
  model: string;
  category: AirCurtainCategory;
  brand: string;
  motorType: AirCurtainMotorType;
  brandId: string | null;
  seriesId: string | null;
  drawingUrl: string | null;
  impellerDiameter: number | null;
  lengthMm: number;
  inputPowerW: number | null;
  inputPowerLowW: number | null;
  airVelocityMs: number | null;
  airVelocityLowMs: number | null;
  airVolumeCmh: number | null;
  airVolumeCfm: number | null;
  airVolumeLowCmh: number | null;
  airVolumeLowCfm: number | null;
  noiseDb: number | null;
  noiseLowDb: number | null;
  /** Octave band sound levels dB @ 3 m (63 Hz … 8 kHz) */
  noise63: number | null;
  noise125: number | null;
  noise250: number | null;
  noise500: number | null;
  noise1k: number | null;
  noise2k: number | null;
  noise4k: number | null;
  noise8k: number | null;
  netWeightKg: number | null;
  grossWeightKg: number | null;
  unitSize: string | null;
  cartonSize: string | null;
  mountingHeightMin: number | null;
  mountingHeightMax: number | null;
  /** Discharge slot width (mm) — drives the plane-jet decay projection */
  slotWidthMm: number | null;
  /** Nameplate supply voltage, e.g. "220-240V" */
  voltage: string | null;
  /** Rated supply frequency of the catalogue data (Hz) */
  frequencyHz: number | null;
  remarks: string | null;
  displayOrder: number;
}

export interface AirCurtainBrand {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  notes: string | null;
  displayOrder: number;
}

export interface AirCurtainSeries {
  id: string;
  brandId: string;
  name: string;
  description: string | null;
  category: AirCurtainCategory;
  motorType: AirCurtainMotorType;
  imageUrl: string | null;
  drawingUrl: string | null;
  catalogueUrl: string | null;
  datasheetDescription: string | null;
  voltage: string | null;
  frequencyHz: number | null;
  displayOrder: number;
}

export interface AirCurtainDimensionRow {
  id: string;
  seriesId: string;
  modelId: string | null;
  label: string;
  values: Record<string, string | number>;
  displayOrder: number;
}

export interface AirCurtainCriteria {
  /** Door / opening width in mm */
  doorWidthMm: number;
  /** Door / opening height in m (also the mounting height) */
  doorHeightM: number;
  category?: AirCurtainCategory | 'any';
  speed: AirCurtainSpeed;
  /** Minimum nozzle (outlet) velocity of the unit (m/s) */
  minNozzleVelocity: number;
  /** Minimum total airflow required (m³/h) */
  minAirflowCmh: number;
  motorType?: AirCurtainMotorType | 'any';
  brand?: string | 'any';
  seriesId?: string | 'any';
  /** Allow mixing different model lengths to cover the opening */
  allowCombinations?: boolean;
  /** Minimum acceptable air velocity at floor level (m/s) */
  minFloorVelocity: number;
  /** Supply frequency the unit will run at (Hz). Catalogue data is scaled by the fan laws. */
  supplyFrequencyHz?: number;
  /**
   * Minimum length match (%) — installed length as a percentage of the opening
   * width. Combinations below this are rejected. Default 75. 100 = full coverage only.
   */
  minMatchPercent?: number;
  /**
   * Maximum length match (%) — combinations above this are rejected as
   * excessively oversized. Default unlimited.
   */
  maxMatchPercent?: number;
  /**
   * What drives the selection:
   *  - 'door'    (default) — cover the opening width, airflow is only a minimum filter
   *  - 'airflow' — meet the required airflow; opening width is ignored and the
   *                quantity is derived purely from the air volume per unit.
   */
  selectionBasis?: 'door' | 'airflow';
}


/** Nominal discharge slot width (m) used for the plane-jet projection. */
export const DEFAULT_SLOT_WIDTH_M = 0.05;

/** Slot width (m) for a model — falls back to the catalogue default. */
export function slotWidthOf(model: Pick<AirCurtainModel, 'slotWidthMm'> | null | undefined): number {
  const mm = model?.slotWidthMm;
  return mm && mm > 0 ? mm / 1000 : DEFAULT_SLOT_WIDTH_M;
}

export interface VelocityPoint {
  distance: number;
  velocity: number;
}

export interface AirCurtainUnit {
  model: AirCurtainModel;
  qty: number;
}

export interface AirCurtainSelection {
  /** Primary (largest) model in the arrangement */
  model: AirCurtainModel;
  /** Full arrangement — one entry per distinct model length used */
  units: AirCurtainUnit[];
  /** Human readable arrangement, e.g. "1 x 1500mm + 1 x 1000mm" */
  arrangement: string;
  /** Number of units required side-by-side to cover the opening */
  unitsRequired: number;
  /** Total installed length (mm) */
  totalLengthMm: number;
  coverage: number;
  /** Installed length as a percentage of the required opening width */
  matchPercent: number;
  outletVelocity: number;

  floorVelocity: number;
  /** Distance (m) at which the jet decays to the minimum acceptable velocity */
  effectiveThrowM: number;
  totalAirVolumeCmh: number;
  totalAirVolumeCfm: number;
  totalPowerW: number;
  noiseDb: number | null;
  /** Combined octave band levels dB @ 3 m, or null when no band data exists */
  octaveBands: { label: string; value: number }[] | null;
  /** True when the octave spectrum was derived from the overall dB(A) level */
  octaveBandsEstimated: boolean;
  totalWeightKg: number;
  heightSuitable: boolean;
  velocityProfile: VelocityPoint[];
  /** Supply frequency used for the selection (Hz) */
  supplyFrequencyHz: number;
  /** Rated (catalogue) frequency of the governing unit (Hz) */
  ratedFrequencyHz: number;
  /** Fan-law speed ratio applied to the catalogue data (1 = catalogue values) */
  frequencyRatio: number;
  voltage: string | null;
  score: number;
}

/**
 * Plane (slot) jet decay constant. For a free plane jet the centreline
 * velocity decays with the square root of the distance:
 *   V(x) = V0 * K * sqrt(b0 / x)   for x > ~10 * b0
 */
export const JET_CONSTANT = 2.4;

export function jetVelocityAt(outletVelocity: number, slotWidthM: number, distanceM: number): number {
  if (!outletVelocity || outletVelocity <= 0) return 0;
  if (distanceM <= 0) return outletVelocity;
  const core = 5 * slotWidthM; // potential core — velocity stays at outlet value
  if (distanceM <= core) return outletVelocity;
  const v = outletVelocity * JET_CONSTANT * Math.sqrt(slotWidthM / distanceM);
  return Math.min(outletVelocity, v);
}

export function buildVelocityProfile(
  outletVelocity: number,
  slotWidthM: number,
  maxDistanceM: number,
): VelocityPoint[] {
  const points: VelocityPoint[] = [];
  const step = Math.max(0.1, Math.round((maxDistanceM / 20) * 10) / 10);
  for (let d = 0; d <= maxDistanceM + 1e-6; d += step) {
    const distance = Math.round(d * 100) / 100;
    points.push({ distance, velocity: Math.round(jetVelocityAt(outletVelocity, slotWidthM, distance) * 100) / 100 });
  }
  return points;
}

/** Distance at which the jet decays to the target velocity */
export function effectiveThrow(outletVelocity: number, slotWidthM: number, targetVelocity: number): number {
  if (!outletVelocity || targetVelocity <= 0) return 0;
  if (targetVelocity >= outletVelocity) return 5 * slotWidthM;
  const x = slotWidthM * Math.pow((outletVelocity * JET_CONSTANT) / targetVelocity, 2);
  return Math.round(x * 100) / 100;
}

/** Default catalogue frequency when a model has none recorded. */
export const DEFAULT_FREQUENCY_HZ = 50;

export function ratedFrequencyOf(model: Pick<AirCurtainModel, 'frequencyHz'>): number {
  const f = model.frequencyHz;
  return f && f > 0 ? f : DEFAULT_FREQUENCY_HZ;
}

/**
 * Fan-law speed ratio for running catalogue data at another supply frequency.
 * Airflow & velocity scale with the ratio, power with its cube and sound with
 * 50 x log10(ratio).
 */
export function frequencyRatioOf(
  model: Pick<AirCurtainModel, 'frequencyHz'>,
  supplyFrequencyHz?: number,
): number {
  const rated = ratedFrequencyOf(model);
  if (!supplyFrequencyHz || supplyFrequencyHz <= 0) return 1;
  return supplyFrequencyHz / rated;
}

export const OCTAVE_BAND_LABELS = ['63', '125', '250', '500', '1k', '2k', '4k', '8k'];

/**
 * Typical axial air-curtain sound spectrum shape (relative dB per band).
 * Used only when a model has no measured octave data, so a full spectrum can
 * still be reported. The shape is normalised so the logarithmic sum of the
 * bands equals the overall dB(A) level.
 */
const OCTAVE_SHAPE = [-4, -1, 0, -1, -3, -6, -10, -16];

export function estimateOctaveBands(overallDbA: number): { label: string; value: number }[] {
  const sum = OCTAVE_SHAPE.reduce((s, o) => s + Math.pow(10, o / 10), 0);
  const offset = overallDbA - 10 * Math.log10(sum);
  return OCTAVE_BAND_LABELS.map((label, i) => ({
    label,
    value: Math.round((OCTAVE_SHAPE[i] + offset) * 10) / 10,
  }));
}

export function noiseCorrection(ratio: number): number {
  if (!ratio || ratio <= 0 || ratio === 1) return 0;
  return 50 * Math.log10(ratio);
}

function speedValues(model: AirCurtainModel, speed: AirCurtainSpeed, supplyFrequencyHz?: number) {
  const r = frequencyRatioOf(model, supplyFrequencyHz);
  const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  // Medium = midpoint of the high/low catalogue values (falls back to whichever exists).
  const pick = (lo: number | null, hi: number | null): number | null => {
    if (speed === 'low') return lo ?? hi;
    if (speed === 'medium') return lo != null && hi != null ? (lo + hi) / 2 : (hi ?? lo);
    return hi ?? lo;
  };
  const noise = pick(model.noiseLowDb, model.noiseDb);
  return {
    ratio: r,
    velocity: round((pick(model.airVelocityLowMs, model.airVelocityMs) ?? 0) * r),
    cmh: round((pick(model.airVolumeLowCmh, model.airVolumeCmh) ?? 0) * r, 0),
    cfm: round((pick(model.airVolumeLowCfm, model.airVolumeCfm) ?? 0) * r, 0),
    power: round((pick(model.inputPowerLowW, model.inputPowerW) ?? 0) * r ** 3, 1),
    noise: noise === null ? null : round(noise + noiseCorrection(r), 1),
  };
}

type Candidate = { model: AirCurtainModel; vals: ReturnType<typeof speedValues> };

/**
 * Stable catalogue family key used when creating mixed-length banks.
 * FM-4510 / FM-4515 / FM-4520 belong to FM-45, while FM-55 is a separate
 * performance series even if imported rows have a missing or incorrect seriesId.
 */
function catalogueSeriesKey(model: AirCurtainModel): string {
  const normalized = model.model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = normalized.match(/^([A-Z]+)(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : (model.seriesId || normalized);
}

function buildSelection(
  units: AirCurtainUnit[],
  candidates: Candidate[],
  criteria: AirCurtainCriteria,
): AirCurtainSelection | null {
  const { doorWidthMm, doorHeightM, minFloorVelocity, minAirflowCmh } = criteria;

  const valsOf = (m: AirCurtainModel) => candidates.find((c) => c.model.id === m.id)!.vals;

  const totalUnits = units.reduce((s, u) => s + u.qty, 0);
  const totalLengthMm = units.reduce((s, u) => s + u.qty * u.model.lengthMm, 0);
  const totalCmh = units.reduce((s, u) => s + u.qty * valsOf(u.model).cmh, 0);
  const totalCfm = units.reduce((s, u) => s + u.qty * valsOf(u.model).cfm, 0);
  const totalPower = units.reduce((s, u) => s + u.qty * valsOf(u.model).power, 0);
  const totalWeight = units.reduce((s, u) => s + u.qty * (u.model.netWeightKg ?? 0), 0);

  if (minAirflowCmh > 0 && totalCmh < minAirflowCmh) return null;

  // Weakest jet in the arrangement governs the protection at floor level.
  const weakest = units.reduce((a, b) => (valsOf(b.model).velocity < valsOf(a.model).velocity ? b : a));
  const outletVelocity = valsOf(weakest.model).velocity;
  // Jet decay uses the actual discharge slot width of the governing unit.
  const slotWidthM = slotWidthOf(weakest.model);
  const floorVelocity = Math.round(jetVelocityAt(outletVelocity, slotWidthM, doorHeightM) * 100) / 100;
  if (floorVelocity < minFloorVelocity) return null;

  const noiseValues = units.map((u) => valsOf(u.model).noise).filter((n): n is number => n !== null);
  const noiseDb = noiseValues.length ? Math.max(...noiseValues) : null;

  // Combine octave bands logarithmically across all installed units
  const bandKeys: { label: string; key: keyof AirCurtainModel }[] = [
    { label: '63', key: 'noise63' },
    { label: '125', key: 'noise125' },
    { label: '250', key: 'noise250' },
    { label: '500', key: 'noise500' },
    { label: '1k', key: 'noise1k' },
    { label: '2k', key: 'noise2k' },
    { label: '4k', key: 'noise4k' },
    { label: '8k', key: 'noise8k' },
  ];
  const bands = bandKeys.map(({ label, key }) => {
    let sum = 0;
    let any = false;
    for (const u of units) {
      const v = u.model[key] as number | null;
      if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
      any = true;
      const corrected = Number(v) + noiseCorrection(valsOf(u.model).ratio);
      sum += u.qty * Math.pow(10, corrected / 10);
    }
    return { label, value: any ? Math.round(10 * Math.log10(sum) * 10) / 10 : null };
  });
  let octaveBandsEstimated = false;
  let octaveBands = bands.some((b) => b.value !== null)
    ? bands.map((b) => ({ label: b.label, value: b.value ?? 0 }))
    : null;
  if (!octaveBands && noiseDb !== null) {
    octaveBands = estimateOctaveBands(noiseDb);
    octaveBandsEstimated = true;
  }

  const airflowBasis = criteria.selectionBasis === 'airflow' && minAirflowCmh > 0;

  // In airflow mode the match is measured against the required air volume,
  // otherwise against the opening width.
  const coverageRatio = airflowBasis
    ? totalCmh / minAirflowCmh
    : doorWidthMm > 0
      ? totalLengthMm / doorWidthMm
      : 1;
  const coverage = coverageRatio;
  const fitDifference = Math.abs(coverageRatio - 1);

  const mixPenalty = (units.length - 1) * 40;
  // Prefer units whose rated mounting-height band actually suits the opening:
  // a 3.0-3.5 m unit on a 2.6 m door is over-specified and must rank lower.
  const heightPenalty = units.reduce((s, u) => {
    const max = u.model.mountingHeightMax;
    if (!max || max <= 0) return s;
    return s + Math.max(0, max - doorHeightM) * 60;
  }, 0);
  const score =
    fitDifference * 1000 +
    totalUnits * 10 +
    mixPenalty +
    heightPenalty +
    totalPower / 500 +
    Math.max(0, floorVelocity - minFloorVelocity - 1) * 10;

  // Report the actual ratio without capping it. For a 2500 mm requirement:
  // 2500 mm = 100%, 3000 mm = 120%, and 2400 mm = 96%.
  const matchPercent = Math.round(coverageRatio * 1000) / 10;



  const sorted = [...units].sort((a, b) => b.model.lengthMm - a.model.lengthMm);
  const primary = sorted[0].model;
  const primaryVoltage = primary.voltage ?? units.map((u) => u.model.voltage).find(Boolean) ?? null;

  return {
    model: primary,
    units: sorted,
    arrangement: sorted.map((u) => `${u.qty} x ${u.model.model} (${u.model.lengthMm}mm)`).join(' + '),
    unitsRequired: totalUnits,
    totalLengthMm,
    coverage,
    matchPercent,

    outletVelocity,
    floorVelocity,
    effectiveThrowM: effectiveThrow(outletVelocity, slotWidthM, minFloorVelocity),
    totalAirVolumeCmh: Math.round(totalCmh),
    totalAirVolumeCfm: Math.round(totalCfm),
    totalPowerW: Math.round(totalPower),
    noiseDb,
    octaveBands,
    octaveBandsEstimated,
    totalWeightKg: Math.round(totalWeight * 10) / 10,
    heightSuitable:
      !primary.mountingHeightMax || doorHeightM <= primary.mountingHeightMax,
    velocityProfile: buildVelocityProfile(outletVelocity, slotWidthM, doorHeightM),
    supplyFrequencyHz: criteria.supplyFrequencyHz && criteria.supplyFrequencyHz > 0
      ? criteria.supplyFrequencyHz
      : ratedFrequencyOf(weakest.model),
    ratedFrequencyHz: ratedFrequencyOf(weakest.model),
    frequencyRatio: Math.round(valsOf(weakest.model).ratio * 1000) / 1000,
    voltage: primaryVoltage,
    score,
  };
}

/**
 * Recalculate one exact, already-chosen arrangement from catalogue models.
 * Used for customer-requested model promotions after optimum selection, so
 * quantities and width suffixes remain unchanged while performance is updated.
 */
export function rebuildAirCurtainSelection(
  units: AirCurtainUnit[],
  criteria: AirCurtainCriteria,
): AirCurtainSelection | null {
  if (!units.length) return null;
  const candidates: Candidate[] = units.map(({ model }) => ({
    model,
    vals: speedValues(model, criteria.speed, criteria.supplyFrequencyHz),
  }));
  return buildSelection(units, candidates, criteria);
}

export function selectAirCurtains(
  models: AirCurtainModel[],
  criteria: AirCurtainCriteria,
  limit = 25,
): AirCurtainSelection[] {
  const {
    doorWidthMm,
    doorHeightM,
    category,
    speed,
    minNozzleVelocity,
    motorType,
    brand,
    seriesId,
    allowCombinations = true,
    supplyFrequencyHz,
    selectionBasis = 'door',
  } = criteria;
  const airflowBasis = selectionBasis === 'airflow' && criteria.minAirflowCmh > 0;
  if (!doorHeightM || doorHeightM <= 0) return [];
  if (!airflowBasis && (!doorWidthMm || doorWidthMm <= 0)) return [];

  const buildCandidates = (respectMinHeight: boolean): Candidate[] => {
    const list: Candidate[] = [];
    for (const model of models) {
      if (category && category !== 'any' && model.category !== category) continue;
      if (motorType && motorType !== 'any' && model.motorType !== motorType) continue;
      if (brand && brand !== 'any' && model.brand !== brand) continue;
      if (seriesId && seriesId !== 'any' && model.seriesId !== seriesId) continue;

      const maxH = model.mountingHeightMax ?? 0;
      if (maxH > 0 && doorHeightM > maxH) continue;
      // The rated band also has a lower limit — a 3.0-3.5 m unit must not be
      // offered for a 2.6 m door (small tolerance for rounding).
      const minH = model.mountingHeightMin ?? 0;
      if (respectMinHeight && minH > 0 && doorHeightM < minH - 0.05) continue;

      const vals = speedValues(model, speed, supplyFrequencyHz);
      if (!vals.velocity || !model.lengthMm) continue;
      if (minNozzleVelocity > 0 && vals.velocity < minNozzleVelocity) continue;

      list.push({ model, vals });
    }
    return list;
  };

  // Respect the rated mounting-height band; only if that leaves nothing at all
  // do we fall back to the wider list so the user still gets an option.
  let candidates = buildCandidates(true);
  if (!candidates.length) candidates = buildCandidates(false);

  const results: AirCurtainSelection[] = [];
  const seen = new Set<string>();

  const push = (units: AirCurtainUnit[]) => {
    const key = units
      .map((u) => `${u.model.id}:${u.qty}`)
      .sort()
      .join('|');
    if (seen.has(key)) return;
    if (!airflowBasis) {
      // Minimum match filter: installed length must reach the chosen % of the opening width.
      const totalLen = units.reduce((s, u) => s + u.qty * u.model.lengthMm, 0);
      const minMatch = criteria.minMatchPercent ?? 75;
      const maxMatch = criteria.maxMatchPercent ?? Infinity;
      const match = (totalLen / doorWidthMm) * 100;
      if (match < minMatch - 1e-9) return;
      if (match > maxMatch + 1e-9) return;
    }
    const sel = buildSelection(units, candidates, criteria);
    if (!sel) return;
    seen.add(key);
    results.push(sel);
  };

  if (airflowBasis) {
    // Airflow-driven selection: quantity comes from the air volume per unit and
    // the opening width plays no part at all.
    const required = criteria.minAirflowCmh;
    for (const { model, vals } of candidates) {
      if (!vals.cmh || vals.cmh <= 0) continue;
      const needed = Math.ceil(required / vals.cmh - 1e-9);
      for (const qty of [needed, needed + 1]) {
        if (qty < 1 || qty > 6) continue;
        // buildSelection already rejects anything below the required airflow.
        push([{ model, qty }]);
      }
    }
    return results.sort((x, y) => x.score - y.score).slice(0, limit);
  }

  // 1) Single-model banks. Include both under- and over-coverage options so
  // the displayed percentage is a true comparison rather than a pass/fail score.
  for (const { model } of candidates) {
    const idealQty = doorWidthMm / model.lengthMm;
    const quantities = new Set([
      Math.max(1, Math.floor(idealQty)),
      Math.max(1, Math.ceil(idealQty)),
    ]);
    for (const qty of quantities) {
      if (qty <= 6) push([{ model, qty }]);
    }
  }


  // 2) Mixed-length arrangements within the same series/category, e.g. 2.5m = 1.5m + 1.0m
  if (allowCombinations) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const a = candidates[i].model;
        const b = candidates[j].model;
        if (a.category !== b.category) continue;
        // "Allow mixed lengths" means different lengths from ONE product
        // series. Never combine FM-45 with FM-55 (or any other family).
        if (a.seriesId && b.seriesId && a.seriesId !== b.seriesId) continue;
        if (catalogueSeriesKey(a) !== catalogueSeriesKey(b)) continue;
        if (a.brand !== b.brand) continue;
        if (b.lengthMm >= a.lengthMm) continue;

        for (let qa = 1; qa <= 5; qa++) {
          const remaining = doorWidthMm - qa * a.lengthMm;
          if (remaining <= 0) break;
          const idealQb = remaining / b.lengthMm;
          const quantitiesB = new Set([
            Math.max(1, Math.floor(idealQb)),
            Math.max(1, Math.ceil(idealQb)),
          ]);
          for (const qb of quantitiesB) {
            if (qa + qb > 6) continue;
            push([
              { model: a, qty: qa },
              { model: b, qty: qb },
            ]);
          }
        }
      }
    }
  }

  // Ranking priority for door-width selection:
  // 1. full coverage, 2. closest width to 100%, 3. fewer physical units,
  // 4. fewer distinct model lengths, then engineering score.
  // This prevents 3 x 900 mm (108%) outranking an exact 1500 + 1000 mm
  // two-unit solution for a 2500 mm opening.
  return results
    .sort((x, y) => {
      const fx = x.matchPercent >= 100 ? 0 : 1;
      const fy = y.matchPercent >= 100 ? 0 : 1;
      const widthDifference = Math.abs(x.matchPercent - 100) - Math.abs(y.matchPercent - 100);
      return (
        fx - fy ||
        widthDifference ||
        x.unitsRequired - y.unitsRequired ||
        x.units.length - y.units.length ||
        x.score - y.score
      );
    })
    .slice(0, limit);
}

export const CATEGORY_LABELS: Record<AirCurtainCategory, string> = {
  surface: 'Wall Mounted',
  recessed: 'Ceiling Recessed',
};
