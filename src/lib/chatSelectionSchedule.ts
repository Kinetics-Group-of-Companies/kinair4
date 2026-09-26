import { AIRFLOW_UNITS, PRESSURE_UNITS, calculateAirDensity, findOptimalSelections, type FanDatabase, type FanDimension, type FanSelection } from "@/lib/fanData";
import { selectAirCurtains, type AirCurtainModel, type AirCurtainBrand, type AirCurtainSeries, type AirCurtainSelection } from "@/lib/airCurtainData";
import { rankFanSelections, rankAirCurtains, type FanOptimizeFor, type AcOptimizeFor } from "@/lib/chatOptimize";

export type ScheduleSelectionDuty = {
  product: "fan" | "air_curtain"; tag?: string | null; quantity?: number | null;
  airflow?: number | null; airflow_unit?: keyof typeof AIRFLOW_UNITS;
  static_pressure?: number | null; pressure_unit?: keyof typeof PRESSURE_UNITS;
  series_name?: string | null; fan_type?: "inline_ducted" | "wall_mounted" | "axial" | null;
  material?: string | null; motor_poles?: number | null; max_noise_db?: number | null;
  door_width?: number | null; door_width_unit?: "mm" | "cm" | "m" | "in" | "ft";
  door_height?: number | null; door_height_unit?: "mm" | "cm" | "m" | "in" | "ft";
  mounting?: "surface" | "recessed" | "any"; motor_type?: "AC" | "EC" | "any";
  brand?: string | null; existing_selection?: string | null;
  min_airflow?: number | null; min_airflow_unit?: "CMH" | "CFM" | "LPS";
  min_floor_velocity?: number | null; min_nozzle_velocity?: number | null;
  speed?: "low" | "medium" | "high"; allow_combinations?: boolean;
  supply_frequency_hz?: number; min_match_percent?: number; max_match_percent?: number;
  selection_basis?: "door" | "airflow"; optimize_for?: AcOptimizeFor;
};
const AC_LENGTH_TO_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 } as const;
const AC_AIRFLOW_TO_CMH = { CMH: 1, LPS: 3.6, CFM: 1.6990107955 } as const;
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function resolveScheduleFanSeries(database: FanDatabase, seriesName?: string | null, material?: string | null, installType?: ScheduleSelectionDuty["fan_type"]) {
  const list = database.series;
  const nameOf = (s: (typeof list)[number]) => String(s?.name ?? "").trim();
  const byName = (n: string) => list.find((s) => nameOf(s).toLowerCase() === n);
  const text = (s: (typeof list)[number]) => `${s.name} ${s.description ?? ""}`.toLowerCase();
  const isWall = (s: (typeof list)[number]) => /kin-e/i.test(nameOf(s)) || /wall\s*mount/i.test(text(s));
  if (installType === "wall_mounted") return byName("kin-e") || list.find(isWall);
  if (installType === "axial") return byName("ktaf") || list.find((s) => /axial/i.test(text(s)));
  const wantedRaw = (seriesName || "").trim().toLowerCase();
  const wanted = wantedRaw === "kvf-mr" ? "kvf-m" : wantedRaw;
  if (wanted) {
    const found = list.find((s) => nameOf(s).toLowerCase() === wanted) || list.find((s) => nameOf(s).toLowerCase().includes(wanted));
    if (found && installType === "inline_ducted" && (isWall(found) || /ktaf/i.test(nameOf(found))))
      return byName("kvf-p") || byName("kvf-m") || list.find((s) => !isWall(s));
    if (found) return found;
  }
  const mat = (material || "").trim().toLowerCase();
  if (!mat) return undefined;
  if (/plastic|pvc|abs|pp\b|polypropylene|polymer/.test(mat))
    return list.find((s) => text(s).includes(mat) && /(^|[\s-])p$/i.test(nameOf(s)) && !isWall(s))
      || byName("kvf-p") || list.find((s) => /(^|[\s-])p$/i.test(nameOf(s)) && !isWall(s));
  return list.find((s) => text(s).includes(mat) && !isWall(s))
    || (/metal|steel|galv|gi\b|aluminium|aluminum/.test(mat)
      ? list.find((s) => /(^|[\s-])m$/i.test(nameOf(s)) && !isWall(s)) : undefined);
}

export function selectScheduleFan(
  item: ScheduleSelectionDuty, database: FanDatabase, dimensionsMap?: Map<string, FanDimension>,
  optimize: FanOptimizeFor = "balanced", exactModel?: string,
): FanSelection | null {
  const effectiveExactModel = exactModel || item.existing_selection || undefined;
  const mrRequested = /kvf[\s._-]*mr/i.test(String(item.series_name ?? "")) || /kvf[\s._-]*\d{2,4}[\s._-]*mr/i.test(String(effectiveExactModel ?? ""));
  const coreExactModel = mrRequested && effectiveExactModel ? effectiveExactModel.replace(/MR(?=$|[^A-Z0-9])/i, "M") : effectiveExactModel;
  if (!item.airflow || item.static_pressure == null) return null;
  const airflowUnit = AIRFLOW_UNITS[item.airflow_unit ?? "CFM"] ? item.airflow_unit ?? "CFM" : "CFM";
  const pressureUnit = PRESSURE_UNITS[item.pressure_unit ?? "Pa"] ? item.pressure_unit ?? "Pa" : "Pa";
  const rowLowNoise = (item as any).optimize === "low_noise";
  const rowInstall = item.fan_type ?? ((item.series_name || "").toLowerCase().includes("kin-e") ? "wall_mounted" : null);
  const series = rowInstall === "wall_mounted" ? resolveScheduleFanSeries(database, null, null, "wall_mounted")
    : rowLowNoise ? resolveScheduleFanSeries(database, "KVF-P", null, "inline_ducted")
      : resolveScheduleFanSeries(database, mrRequested ? "KVF-M" : item.series_name, item.material, rowInstall);
  if (item.series_name && !series) return null;
  const found = findOptimalSelections(database, {
    requiredAirflow: item.airflow, requiredPressure: item.static_pressure,
    airflowUnit, pressureUnit, seriesId: series?.id, motorPole: item.motor_poles ?? undefined,
    dimensionsBySeriesAndSize: dimensionsMap,
    safetyFactor: series?.defaultSafetyFactor ?? 1.15, frequency: 50,
    fireClass: "", accessory: "", atexRating: "",
    toleranceMin: database.unitPreferences?.defaultToleranceMin ?? 95,
    toleranceMax: database.unitPreferences?.defaultToleranceMax ?? 105,
    airDensity: calculateAirDensity(0, 20), temperature: 20,
  }, coreExactModel ? 100 : 10);
  let ranked = optimize === "balanced" ? found : rankFanSelections(found, optimize);
  if (item.max_noise_db) {
    const quiet = ranked.filter((r) => !r.noiseData?.overall || r.noiseData.overall <= item.max_noise_db!);
    if (quiet.length) ranked = quiet;
  }
  if (coreExactModel) {
    const wanted = normalize(coreExactModel);
    ranked = ranked.filter((r) => normalize(r.nomenclature).startsWith(wanted));
  }
  const selected = ranked[0] ?? null;
  if (!selected || !mrRequested) return selected;
  return {
    ...selected,
    series: "KVF-MR" as FanSelection["series"],
    nomenclature: selected.nomenclature.replace(/^KVF-(\d{2,4})M(?=$|[^A-Z0-9])/i, "KVF-$1MR"),
    nomenclatureTemplate: "KVF-{size}MR",
  };
}

export function selectScheduleAirCurtain(
  item: ScheduleSelectionDuty,
  models: AirCurtainModel[], seriesRecords: AirCurtainSeries[], brands: AirCurtainBrand[],
  optimize: AcOptimizeFor = "balanced", exactModel?: string,
): { selection: AirCurtainSelection; doorWidthMm: number; doorHeightM: number; minFloorVelocity: number } | null {
  const widthUnit = AC_LENGTH_TO_MM[item.door_width_unit ?? "mm"] ?? 1;
  const heightUnit = AC_LENGTH_TO_MM[item.door_height_unit ?? "m"] ?? 1000;
  // The Selection Assistant's documented defaults for missing air-curtain opening sizes.
  const doorWidthMm = item.door_width ? item.door_width * widthUnit : 1000;
  const doorHeightM = item.door_height ? item.door_height * heightUnit / 1000 : 3;
  const brand = item.brand ? brands.find((b) => b.name.toLowerCase() === item.brand?.toLowerCase())?.name : undefined;
  const existing = String(item.existing_selection ?? "");
  const existingSeries = /FM-?(?:35|45|55)(?:09|10|12|15|18|20)XD/i.test(existing)
    ? seriesRecords.find((s) => /^XD-Centrifugal Flow$/i.test(s.name))
    : /FM-?12(?:09|10|12|15|18|20)N/i.test(existing)
      ? seriesRecords.find((s) => /^N-Cross Flow$/i.test(s.name))
      : /FM-?(?:35|45|55)(?:09|10|12|15|18|20)-L/i.test(existing)
        ? seriesRecords.find((s) => /^N-Centrifugal flow$/i.test(s.name)) : undefined;
  const requested = item.series_name?.trim().toLowerCase();
  const match = existingSeries || (requested
    ? seriesRecords.find((s) => s.name.toLowerCase() === requested)
      || seriesRecords.find((s) => s.name.toLowerCase().includes(requested))
    : undefined);
  const category = existingSeries?.category ?? item.mounting ?? "any";
  const series = match && (category === "any" || match.category === category) ? match : undefined;
  if (requested && !series) return null;
  const minFloorVelocity = item.min_floor_velocity ?? 2;
  const minAirflowCmh = item.min_airflow
    ? item.min_airflow * (AC_AIRFLOW_TO_CMH[item.min_airflow_unit ?? "CFM"] ?? 1.6990107955) : 0;
  const selectionBasis = item.selection_basis ?? (minAirflowCmh > 0 && !item.door_width ? "airflow" : "door");
  const results = selectAirCurtains(models, {
    doorWidthMm, doorHeightM, category, speed: item.speed ?? "high",
    minNozzleVelocity: item.min_nozzle_velocity ?? 0, minAirflowCmh,
    motorType: item.motor_type ?? "any", brand: brand ?? "any",
    seriesId: series?.id ?? "any", allowCombinations: item.allow_combinations ?? true,
    minFloorVelocity, supplyFrequencyHz: item.supply_frequency_hz ?? 50,
    minMatchPercent: item.min_match_percent ?? 95, maxMatchPercent: item.max_match_percent ?? 200,
    selectionBasis,
  });
  let ranked = optimize === "balanced" ? results : rankAirCurtains(results, optimize);
  const existingToken = String(item.existing_selection ?? "").match(/FM[\s-]?(?:12|35|45|55)[\s-]?(?:09|10|12|15|18|20)(?:\s*XD|\s*-?L|\s*N)?/i)?.[0];
  const effectiveExactModel = exactModel || existingToken || undefined;
  if (effectiveExactModel) ranked = ranked.filter((r) => r.units.every((unit) =>
    normalize(unit.model.model).startsWith(normalize(effectiveExactModel))));
  return ranked[0] ? { selection: ranked[0], doorWidthMm, doorHeightM, minFloorVelocity } : null;
}
