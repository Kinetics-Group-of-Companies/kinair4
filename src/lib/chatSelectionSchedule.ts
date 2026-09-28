import { AIRFLOW_UNITS, PRESSURE_UNITS, calculateAirDensity, findOptimalSelections, type FanDatabase, type FanDimension, type FanSelection } from "@/lib/fanData";
import { selectAirCurtains, rebuildAirCurtainSelection, type AirCurtainModel, type AirCurtainBrand, type AirCurtainSeries, type AirCurtainSelection } from "@/lib/airCurtainData";
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
  brand?: string | null; existing_selection?: string | null; remarks?: string | null;
  min_airflow?: number | null; min_airflow_unit?: "CMH" | "CFM" | "LPS";
  min_floor_velocity?: number | null; min_nozzle_velocity?: number | null;
  speed?: "low" | "medium" | "high"; allow_combinations?: boolean;
  supply_frequency_hz?: number; min_match_percent?: number; max_match_percent?: number;
  selection_basis?: "door" | "airflow"; optimize_for?: AcOptimizeFor;
};
const AC_LENGTH_TO_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 } as const;
const AC_AIRFLOW_TO_CMH = { CMH: 1, LPS: 3.6, CFM: 1.6990107955 } as const;
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Exact catalogue codes win. OCR repairs must resolve to one distinct code. */
export function resolveOcrModel(raw: string, catalogue: string[]): string | null {
  const key = normalize(raw);
  const unique = [...new Map(catalogue.map(code => [normalize(code), code])).values()];
  const exact = unique.find(code => normalize(code) === key);
  if (exact) return exact;
  const signature = (value: string) => normalize(value).replace(/[o0]/g, '0').replace(/[il1]/g, '1')
    .replace(/[s5]/g, '5').replace(/[b8]/g, '8').replace(/[z2]/g, '2').replace(/[g6]/g, '6');
  const candidates = unique.filter(code => signature(code) === signature(raw));
  return candidates.length === 1 ? candidates[0] : null;
}

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
  optimize: FanOptimizeFor = "balanced", exactModel?: string, preserveScheduledModel = false,
): FanSelection | null {
  if (!item.airflow || item.static_pressure == null) return null;
  if (preserveScheduledModel && (exactModel || item.existing_selection)) {
    const code = String(exactModel || item.existing_selection).trim();
    const catalogue = database.fans.flatMap(fan => {
      const family = String(fan.series ?? database.series.find(series => series.id === fan.seriesId)?.name ?? '').toUpperCase();
      if (family === 'KIN-E') return [`KIN-${fan.diameter}E`];
      if (family === 'KVF-M') return [`KVF-${fan.diameter}M`, `KVF-${fan.diameter}MR`];
      if (/^KVF-(P|MR)$/.test(family)) return [`KVF-${fan.diameter}${family.slice(4)}`];
      return [];
    });
    const resolved = resolveOcrModel(code, catalogue);
    if (!resolved) return null;
    const key = normalize(resolved);
    const match = /^(kvf)(\d{2,4})(mr|m|p)$/.exec(key) || /^(kin)(\d{2,4})(e)$/.exec(key);
    if (!match) return null;
    const requested = match[1] === "kin" ? "KIN-E" : `KVF-${match[3].toUpperCase()}`;
    const coreSeries = requested === "KVF-MR" ? "KVF-M" : requested;
    const lockedDatabase = { ...database, fans: database.fans.filter(fan =>
      Number(fan.diameter) === Number(match[2]) && normalize(String(fan.series)) === normalize(coreSeries)) };
    const selected = selectScheduleFan({ ...item, series_name: requested, remarks: "", fan_type: null, material: null }, lockedDatabase, dimensionsMap, optimize);
    return selected && normalize(selected.nomenclature) === key ? selected : null;
  }

  // Schedule/quotation validation mode: the printed model is evidence, not truth.
  // Engineering duty + remarks/type/material decide the family and the core
  // selector independently chooses the correct size/model.
  const remarks = String(item.remarks ?? "");
  const existing = String(exactModel || item.existing_selection || "");
  let requestedSeries = String(item.series_name ?? "").trim();
  let rowInstall = item.fan_type ?? null;
  let material = item.material ?? null;

  if (/\broof(?:[ -]?mounted)?\b|\broof\s*fan\b/i.test(remarks)) {
    requestedSeries = "KVF-MR";
    rowInstall = "inline_ducted";
  } else if (/\bwall(?:[ -]?mounted)?\b|\bwall\s*(?:extract|exhaust|fan)\b/i.test(remarks)) {
    requestedSeries = "KIN-E";
    rowInstall = "wall_mounted";
  } else if (/\b(?:tube\s*)?axial\b|\bKTAF\b/i.test(remarks)) {
    requestedSeries = "KTAF";
    rowInstall = "axial";
  }

  if (/\b(?:plastic|pvc|pp|polypropylene|polymer|abs)\b/i.test(remarks)) {
    material = "plastic";
    if (!requestedSeries) requestedSeries = rowInstall === "wall_mounted" ? "KIN-E" : "KVF-P";
  } else if (/\b(?:metal|steel|galvanized|galvanised|\bgi\b|aluminium|aluminum)\b/i.test(remarks)) {
    material = material || "metal";
    if (!requestedSeries && rowInstall !== "wall_mounted" && rowInstall !== "axial") requestedSeries = "KVF-M";
  }

  // If the document gives no engineering family/type clue, use only the family
  // portion of the printed model as a weak fallback. Never lock to its size.
  if (!requestedSeries && !rowInstall && existing) {
    if (/KVF[\s._-]*\d{2,4}[\s._-]*MR/i.test(existing)) requestedSeries = "KVF-MR";
    else if (/KVF[\s._-]*\d{2,4}[\s._-]*P/i.test(existing)) requestedSeries = "KVF-P";
    else if (/KVF[\s._-]*\d{2,4}[\s._-]*M/i.test(existing)) requestedSeries = "KVF-M";
    else if (/KIN[\s._-]*\d{2,4}[\s._-]*E/i.test(existing)) { requestedSeries = "KIN-E"; rowInstall = "wall_mounted"; }
    else if (/\bKTAF\b/i.test(existing)) { requestedSeries = "KTAF"; rowInstall = "axial"; }
  }

  const mrRequested = /kvf[\s._-]*mr/i.test(requestedSeries) || /\broof\b/i.test(remarks);
  const coreSeriesName = mrRequested ? "KVF-M" : requestedSeries;
  const airflowUnit = AIRFLOW_UNITS[item.airflow_unit ?? "CFM"] ? item.airflow_unit ?? "CFM" : "CFM";
  const pressureUnit = PRESSURE_UNITS[item.pressure_unit ?? "Pa"] ? item.pressure_unit ?? "Pa" : "Pa";
  const rowLowNoise = (item as any).optimize === "low_noise" || /\b(?:low\s*noise|quiet|silent)\b/i.test(remarks);
  const series = rowInstall === "wall_mounted"
    ? resolveScheduleFanSeries(database, null, null, "wall_mounted")
    : rowInstall === "axial"
      ? resolveScheduleFanSeries(database, null, null, "axial")
      : rowLowNoise
        ? resolveScheduleFanSeries(database, "KVF-P", null, "inline_ducted")
        : resolveScheduleFanSeries(database, coreSeriesName, material, rowInstall);
  if ((requestedSeries || rowInstall || material) && !series) return null;

  const found = findOptimalSelections(database, {
    requiredAirflow: item.airflow, requiredPressure: item.static_pressure,
    airflowUnit, pressureUnit, seriesId: series?.id, motorPole: item.motor_poles ?? undefined,
    dimensionsBySeriesAndSize: dimensionsMap,
    safetyFactor: series?.defaultSafetyFactor ?? 1.15, frequency: 50,
    fireClass: "", accessory: "", atexRating: "",
    toleranceMin: database.unitPreferences?.defaultToleranceMin ?? 95,
    toleranceMax: database.unitPreferences?.defaultToleranceMax ?? 105,
    airDensity: calculateAirDensity(0, 20), temperature: 20,
  }, 20);
  let ranked = optimize === "balanced" ? found : rankFanSelections(found, optimize);
  if (item.max_noise_db) {
    const quiet = ranked.filter((r) => !r.noiseData?.overall || r.noiseData.overall <= item.max_noise_db!);
    if (quiet.length) ranked = quiet;
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
  optimize: AcOptimizeFor = "balanced", exactModel?: string, preserveScheduledModel = false,
): { selection: AirCurtainSelection; doorWidthMm: number; doorHeightM: number; minFloorVelocity: number } | null {
  const widthUnit = AC_LENGTH_TO_MM[item.door_width_unit ?? "mm"] ?? 1;
  const heightUnit = AC_LENGTH_TO_MM[item.door_height_unit ?? "m"] ?? 1000;
  // The Selection Assistant's documented defaults for missing air-curtain opening sizes.
  const doorWidthMm = item.door_width ? item.door_width * widthUnit : 1000;
  const doorHeightM = item.door_height ? item.door_height * heightUnit / 1000 : 3;
  if (preserveScheduledModel && (exactModel || item.existing_selection)) {
    const parts = String(exactModel || item.existing_selection).split(/\s*\+\s*/);
    const units = [];
    for (const part of parts) {
      const count = /^\s*(\d+)\s*[x×]\s*/i.exec(part);
      const code = part.replace(/^\s*\d+\s*[x×]\s*/i, "").replace(/\s*\(\s*\d+(?:\.\d+)?\s*mm\s*\)\s*$/i, "").trim();
      const resolved = resolveOcrModel(code, models.map(model => model.model));
      const matches = resolved ? models.filter(model => normalize(model.model) === normalize(resolved)) : [];
      if (matches.length !== 1 || (count && Number(count[1]) < 1)) return null;
      units.push({ model: matches[0], qty: count ? Number(count[1]) : 1 });
    }
    // Build catalogue data for the supplied bank. Do not optimize its size or
    // reject it in favour of another model when the engineering duty differs.
    const selection = rebuildAirCurtainSelection(units, {
      doorWidthMm, doorHeightM, category: "any", speed: item.speed ?? "high",
      minNozzleVelocity: 0, minAirflowCmh: 0, motorType: "any", brand: "any",
      seriesId: "any", allowCombinations: false, minFloorVelocity: item.min_floor_velocity ?? 2,
      supplyFrequencyHz: item.supply_frequency_hz ?? 50, selectionBasis: "door",
    });
    return selection ? { selection, doorWidthMm, doorHeightM, minFloorVelocity: item.min_floor_velocity ?? 2 } : null;
  }
  const brand = item.brand ? brands.find((b) => b.name.toLowerCase() === item.brand?.toLowerCase())?.name : undefined;
  const existing = String(item.existing_selection ?? "");
  const remarks = String(item.remarks ?? "");
  const existingKey = normalize(existing);
  const existingModel = existingKey
    ? models.find((model) => normalize(String(model.model ?? "")) === existingKey)
      || models.find((model) => {
        const candidate = normalize(String(model.model ?? ""));
        return candidate.length >= 5 && (existingKey.includes(candidate) || candidate.includes(existingKey));
      })
    : undefined;
  const existingSeries = existingModel?.seriesId
    ? seriesRecords.find((s) => s.id === existingModel.seriesId)
    : /FM[\s-]*(?:35|45|55)(?:09|10|12|15|18|20)?XD/i.test(existing)
      ? seriesRecords.find((s) => /^XD-Centrifugal Flow$/i.test(s.name))
      : /FM[\s-]*12(?:09|10|12|15|18|20)?N/i.test(existing)
        ? seriesRecords.find((s) => /^N-Cross Flow$/i.test(s.name))
        : /FM[\s-]*(?:35|45|55)(?:09|10|12|15|18|20)?(?:-?L)/i.test(existing)
          ? seriesRecords.find((s) => /^N-Centrifugal flow$/i.test(s.name)) : undefined;
  const remarksCategory = /\b(?:recessed|concealed|flush)\b/i.test(remarks)
    ? "recessed"
    : /\b(?:wall|surface|exposed)\b/i.test(remarks)
      ? "surface"
      : undefined;
  const remarksSeries = /\bcross\s*flow\b/i.test(remarks) && !/centrifugal/i.test(remarks)
    ? seriesRecords.find((s) => /^N-Cross Flow$/i.test(s.name))
    : /centrifugal/i.test(remarks) && remarksCategory === "recessed"
      ? seriesRecords.find((s) => /^XD-Centrifugal Flow$/i.test(s.name))
      : /centrifugal/i.test(remarks)
        ? seriesRecords.find((s) => /^N-Centrifugal Flow$/i.test(s.name))
        : undefined;
  const requested = item.series_name?.trim().toLowerCase();
  const requestedSeries = requested
    ? seriesRecords.find((s) => s.name.toLowerCase() === requested)
      || seriesRecords.find((s) => s.name.toLowerCase().includes(requested))
    : undefined;
  const match = remarksSeries || requestedSeries || existingSeries;
  const category = remarksCategory ?? item.mounting ?? existingSeries?.category ?? "any";
  const series = match && (category === "any" || match.category === category) ? match : undefined;
  if (requested && !series) return null;
  const minFloorVelocity = item.min_floor_velocity ?? 2;
  const minAirflowCmh = item.min_airflow
    ? item.min_airflow * (AC_AIRFLOW_TO_CMH[item.min_airflow_unit ?? "CFM"] ?? 1.6990107955) : 0;
  const selectionBasis = item.selection_basis ?? (minAirflowCmh > 0 && !item.door_width ? "airflow" : "door");
  const criteria = {
    doorWidthMm, doorHeightM, category, speed: item.speed ?? "high",
    minNozzleVelocity: item.min_nozzle_velocity ?? 0, minAirflowCmh,
    motorType: item.motor_type ?? "any", brand: brand ?? "any",
    seriesId: series?.id ?? "any", allowCombinations: item.allow_combinations ?? true,
    minFloorVelocity, supplyFrequencyHz: item.supply_frequency_hz ?? 50,
    minMatchPercent: item.min_match_percent ?? 95, maxMatchPercent: item.max_match_percent ?? 200,
    selectionBasis,
  } as const;

  const results = selectAirCurtains(models, criteria);
  let ranked = optimize === "balanced" ? results : rankAirCurtains(results, optimize);
  return ranked[0] ? { selection: ranked[0], doorWidthMm, doorHeightM, minFloorVelocity } : null;
}

