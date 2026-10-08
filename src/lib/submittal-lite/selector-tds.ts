import type { SourceProposed } from "@/lib/chatScheduleDatasheet";
import { PDFDocument } from "pdf-lib";
import { selectScheduleFan, selectScheduleAirCurtain } from "@/lib/chatSelectionSchedule";
import type { FanOptimizeFor, AcOptimizeFor } from "@/lib/chatOptimize";
import type { FanDimension } from "@/lib/fanData";
import { AIRFLOW_UNITS, PRESSURE_UNITS, findOptimalSelections, type FanDatabase } from "@/lib/fanData";
import { selectAirCurtains, type AirCurtainModel, type AirCurtainBrand, type AirCurtainSeries, type AirCurtainDimensionRow } from "@/lib/airCurtainData";
import { getSchedulePageCount, buildCombinedScheduleDatasheet, type ChatScheduleFanRow, type ChatScheduleAirCurtainRow } from "@/lib/chatScheduleDatasheet";
import type { SeriesModel } from "./schedule-series";


export function canonicalFanSelection(raw: string | null | undefined, context: SelectorContext): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // OCR can read 100 as IOO. Only digit positions in known KVF sizes
  // may be repaired, and only when that size exists in the same series.
  const numeric = compact.replace(/^(KVF)([0-9IO]{2,4})(MR|M|P)$/, (_, prefix, size, suffix) =>
    prefix + size.replace(/I/g, "1").replace(/O/g, "0") + suffix);
  const hit = numeric.match(/^K?V?F(\d{2,4})(MR|M|P)$/);
  if (!hit) return value;
  const diameter = Number(hit[1]);
  const suffix = hit[2];
  const seriesName = `KVF-${suffix}`;
  const series = (context.database.series ?? []).find((row) =>
    String(row.name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === seriesName.replace(/[^A-Z0-9]/g, ""));
  const exists = (context.database.fans ?? []).some((fan) =>
    Number(fan.diameter) === diameter &&
    (fan.seriesId === series?.id || String(fan.series ?? "").toUpperCase() === seriesName));
  return exists ? `KVF-${diameter}${suffix}` : value;
}

function canonicalAirCurtainSelection(raw: string | null | undefined, context: SelectorContext): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const token = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const exact = context.airModels.find((model) =>
    String(model.model ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === token);
  if (exact) return exact.model;

  // Correct a one-character OCR loss only when it resolves uniquely.
  const digits = token.match(/\d{4}/)?.[0];
  if (digits) {
    const close = context.airModels.filter((model) => {
      const candidate = String(model.model ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!candidate.includes(digits)) return false;
      return candidate === `FM${token.replace(/^F/, "")}` || token === candidate.replace(/^FM/, "F");
    });
    if (close.length === 1) return close[0].model;
  }

  // Anything shorter (e.g. FM-12N) is deliberately NOT returned as an exact
  // model. The core selector will use it as a family hint and select by duty.
  return undefined;
}

type SelectorContext = {
  database: FanDatabase;
  airModels: AirCurtainModel[];
  airBrands: AirCurtainBrand[];
  airSeries: AirCurtainSeries[];
  airDimensions: AirCurtainDimensionRow[];
  dimensionsMap?: Map<string, FanDimension>;
  companyName?: string | null;
  logoUrl?: string | null;
  brandLogoUrl?: string | null;
  projectDetails?: { label: string; value: string }[];
};
const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
const number = (text: string) => Number(text.replace(/,/g, ""));
function modelPattern(code: string): RegExp {
  const fan = /^KVF-(\d{2,4})(MR|M|P)$/i.exec(code);
  const cross = /^FM-(\d{4})N/i.exec(code);
  const xd = /^FM-(\d{4})XD/i.exec(code);
  const centrifugal = /^FM-(\d{4})-L/i.exec(code);
  const stem = fan ? `KVF[\\s._-]*${fan[1]}[\\s._-]*${fan[2]}`
    : cross ? `FM[\\s._-]*${cross[1]}[\\s._-]*N`
    : xd ? `FM[\\s._-]*${xd[1]}[\\s._-]*XD`
    : centrifugal ? `FM[\\s._-]*${centrifugal[1]}[\\s._-]*L`
    : code.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).join("[\\s._-]*");
  return new RegExp("(^|[^A-Z0-9])" + stem + "(?=$|[^A-Z0-9])", "i");
}
function airflow(text: string): { amount: number; unit: keyof typeof AIRFLOW_UNITS } | null {
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(m(?:³|3)?\s*\/\s*h|m3h|cmh|cfm|l\s*\/\s*s|lps|cms)\b/i);
  if (!match) return null;
  const token = match[2].replace(/\s/g, "").toLowerCase();
  return { amount: number(match[1]), unit: token === "cfm" ? "CFM" : /^(l\/s|lps)$/.test(token) ? "LPS" : token === "cms" ? "CMS" : "CMH" };
}
function pressure(text: string): { amount: number; unit: keyof typeof PRESSURE_UNITS } | null {
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(pa|mm\s*\.?\s*w\s*\.?\s*g|in\s*\.?\s*w\s*\.?\s*g)\b/i);
  if (!match) return null;
  const token = match[2].replace(/[\s.]/g, "").toLowerCase();
  return { amount: number(match[1]), unit: token === "mmwg" ? "mmwg" : token === "inwg" ? "inwg" : "Pa" };
}
function opening(text: string): { width: number; height: number } | null {
  const pair = text.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i);
  const width = pair ? number(pair[1]) * ({ mm: 1, cm: 10, m: 1000 } as const)[pair[2].toLowerCase() as "mm" | "cm" | "m"]
    : (() => { const m = text.match(/(?:door|opening)\s*width\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i); return m ? number(m[1]) * ({ mm: 1, cm: 10, m: 1000 } as const)[m[2].toLowerCase() as "mm" | "cm" | "m"] : 0; })();
  const height = pair ? number(pair[3]) * ({ mm: 0.001, cm: 0.01, m: 1 } as const)[pair[4].toLowerCase() as "mm" | "cm" | "m"]
    : (() => { const m = text.match(/(?:door|opening|mounting)\s*height\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i); return m ? number(m[1]) * ({ mm: 0.001, cm: 0.01, m: 1 } as const)[m[2].toLowerCase() as "mm" | "cm" | "m"] : 0; })();
  return width > 0 && height > 0 ? { width, height } : null;
}

export type AssistantScheduleItem = {
  product: "fan" | "air_curtain"; tag?: string | null; quantity?: number | null;
  area_served?: string | null; location?: string | null; building?: string | null;
  specified_electrical?: string | null; specified_power_w?: number | null;
  proposed?: SourceProposed | null; source_has_proposed?: boolean | null; motor_rpm?: number | null; fan_rpm?: number | null;
  accessories?: string | null; remarks?: string | null;
  airflow?: number | null; airflow_unit?: keyof typeof AIRFLOW_UNITS;
  static_pressure?: number | null; pressure_unit?: keyof typeof PRESSURE_UNITS;
  series_name?: string | null; motor_poles?: number | null; max_noise_db?: number | null;
  door_width?: number | null; door_width_unit?: "mm" | "cm" | "m" | "in";
  door_height?: number | null; door_height_unit?: "mm" | "cm" | "m" | "in";
  mounting?: "surface" | "recessed" | "any"; motor_type?: "AC" | "EC" | "any";
  brand?: string | null; existing_selection?: string | null;
};

function makeTdsPdf(fanRows: ChatScheduleFanRow[], airRows: ChatScheduleAirCurtainRow[], models: string[], context: SelectorContext, unresolvedRows: string[][] = []) {
  return (async () => {
    const doc = await buildCombinedScheduleDatasheet({
      title: "KINAIR selector technical datasheets", rows: fanRows, database: context.database,
      dimensionsMap: context.dimensionsMap, companyName: context.companyName, logoUrl: context.logoUrl,
      brandLogoUrl: context.brandLogoUrl, projectDetails: context.projectDetails,
      airCurtainRows: airRows, unresolvedRows,
      airCurtainContext: { brands: context.airBrands, series: context.airSeries, dimensions: context.airDimensions },
    });
    const combined = await PDFDocument.load(doc.output("arraybuffer"));
    const scheduleCount = getSchedulePageCount(doc);
    const schedule = await PDFDocument.create();
    const schedulePages = await schedule.copyPages(combined, Array.from({ length: scheduleCount }, (_, index) => index + 1));
    schedulePages.forEach(page => schedule.addPage(page));
    const scheduleBytes = await schedule.save();
    const tds = await PDFDocument.create();
    const firstTdsPage = 1 + scheduleCount;
    const pages = await tds.copyPages(combined, Array.from({ length: combined.getPageCount() - firstTdsPage }, (_, index) => index + firstTdsPage));
    pages.forEach(page => tds.addPage(page));
    const bytes = await tds.save();
    return {
      file: pages.length ? new File([bytes.slice().buffer], "KINAIR-Selector-TDS.pdf", { type: "application/pdf" }) : undefined,
      scheduleFile: new File([scheduleBytes.slice().buffer], "KINAIR-Material-Schedule.pdf", { type: "application/pdf" }),
      models,
      missing: [] as string[]
    };
  })();
}

function fanDutyFromExactModel(item: AssistantScheduleItem, context: SelectorContext): AssistantScheduleItem | null {
  const exact = canonicalFanSelection(item.existing_selection, context);
  if (!exact) return null;
  const compact = exact.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const kvf = compact.match(/^KVF(\d{2,4})(MR|M|P)$/);
  const kine = compact.match(/^KIN(\d{2,4})E$/);
  const ktaf = compact.match(/^KTAF(?:\d+)?(\d{3,4})/) ?? compact.match(/^KTAF(\d{3,4})$/);
  const size = Number(kvf?.[1] ?? kine?.[1] ?? ktaf?.[1] ?? 0);
  if (!size) return null;

  const requestedSeries = kvf
    ? (kvf[2] === "MR" ? "KVF-MR" : `KVF-${kvf[2]}`)
    : kine ? "KIN-E" : "KTAF";
  const coreSeries = requestedSeries === "KVF-MR" ? "KVF-M" : requestedSeries;
  const series = (context.database.series ?? []).find((row) =>
    String(row.name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === coreSeries.replace(/[^A-Z0-9]/g, ""));
  if (!series) return null;

  const fans = context.database.fans.filter((fan) =>
    Number(fan.diameter) === size &&
    (String(fan.series ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === coreSeries.replace(/[^A-Z0-9]/g, "")));
  let chosen: { airflow: number; pressure: number; score: number } | null = null;
  for (const fan of fans) {
    for (const config of fan.bladeConfigurations ?? []) {
      for (const angle of config.bladeAngles ?? []) {
        for (const point of config.performanceData?.[angle] ?? []) {
          if (!(point.airflow > 0) || !(point.staticPressure > 0)) continue;
          const score = (point.totalEfficiency ?? point.efficiency ?? 0) * 1_000_000 + point.airflow * point.staticPressure;
          if (!chosen || score > chosen.score) chosen = { airflow: point.airflow, pressure: point.staticPressure, score };
        }
      }
    }
  }
  if (!chosen) return null;
  return {
    ...item,
    airflow: chosen.airflow,
    airflow_unit: "CMH",
    static_pressure: chosen.pressure,
    pressure_unit: "Pa",
    series_name: requestedSeries,
    existing_selection: exact,
  };
}

/** Printed schedule models are authoritative; missing catalogue matches never permit substitution. */
export async function makeAssistantSubmittalTds(
  items: AssistantScheduleItem[],
  context: SelectorContext,
  optimizeFor: FanOptimizeFor = "balanced",
): Promise<{ file?: File; scheduleFile?: File; models: string[]; missing: string[]; corrections: string[] }> {
  const fanRows: ChatScheduleFanRow[] = [];
  const airRows: ChatScheduleAirCurtainRow[] = [];
  const models: string[] = [];
  const missing: string[] = [];
  const corrections: string[] = [];
  const unresolved = new Set<number>();

  for (const [index, item] of items.entries()) {
    const tag = item.tag?.trim() || `Item ${index + 1}`;
    if (item.product !== "fan" && item.product !== "air_curtain") {
      missing.push(`${tag}: unsupported equipment type; upload its verified TDS`);
      unresolved.add(index); continue;
    }
    if (!Number.isInteger(item.quantity) || Number(item.quantity) <= 0) {
      missing.push(`${tag}: confirm a positive whole-number quantity; no default quantity has been assumed`);
      unresolved.add(index); continue;
    }
    if (item.product === "fan") {
      // Validate the supplied model without substituting another model.
      const resolvedItem = { ...item, existing_selection: canonicalFanSelection(item.existing_selection, context) };
      if (!resolvedItem.airflow || resolvedItem.static_pressure == null) {
        missing.push(`${tag}: airflow and static pressure are required to validate the fan selection`);
      unresolved.add(index);
        continue;
      }
      const flowUnit = AIRFLOW_UNITS[resolvedItem.airflow_unit ?? "CMH"] ? resolvedItem.airflow_unit ?? "CMH" : "CMH";
      const pressureUnit = PRESSURE_UNITS[resolvedItem.pressure_unit ?? "Pa"] ? resolvedItem.pressure_unit ?? "Pa" : "Pa";
      const best = selectScheduleFan(
        resolvedItem,
        context.database,
        context.dimensionsMap,
        optimizeFor,
        resolvedItem.existing_selection?.trim() || undefined,
        true,
      );
      if (!best) {
        missing.push(`${tag}: Matching TDS unavailable for ${resolvedItem.existing_selection || resolvedItem.series_name || "KINAIR fan"} at ${resolvedItem.airflow} ${flowUnit} / ${resolvedItem.static_pressure} ${pressureUnit}`);
      unresolved.add(index);
        continue;
      }
      models.push(best.nomenclature);
      const printedFan = String(item.existing_selection ?? "").trim();
      if (printedFan && normalize(printedFan) !== normalize(best.nomenclature)) {
        corrections.push(`${tag}: ${printedFan} → ${best.nomenclature}`);
      }
      fanRows.push({
        tag,
        quantity: item.quantity!,
        duty: `${resolvedItem.airflow} ${flowUnit} @ ${resolvedItem.static_pressure} ${pressureUnit}`,
        selection: best,
        airflowUnit: flowUnit,
        pressureUnit,
        specified: {
          motorRpm: item.motor_rpm, fanRpm: item.fan_rpm,
          areaServed: item.area_served ?? "",
          location: item.location ?? "",
          building: item.building ?? "",
          electrical: item.specified_electrical ?? "",
          powerW: item.specified_power_w ?? null,
          airflow: resolvedItem.airflow,
          airflowUnit: flowUnit,
          staticPressure: resolvedItem.static_pressure,
          pressureUnit,
        },
        sourceProposed: item.source_has_proposed || item.proposed || item.existing_selection ? { ...item.proposed, model: item.proposed?.model ?? item.existing_selection ?? "" } : undefined,
        accessories: item.accessories ?? "",
        remarks: item.remarks ?? "",
      });
      continue;
    }

    const units = { mm: 1, cm: 10, m: 1000, in: 25.4 };
    if (!item.door_width || !item.door_height) {
      missing.push(`${tag}: door width and mounting height with units`);
      unresolved.add(index);
      continue;
    }
    const doorWidthMm = item.door_width * units[item.door_width_unit ?? "mm"];
    const doorHeightM = item.door_height * units[item.door_height_unit ?? "m"] / 1000;
    const result = selectScheduleAirCurtain(
      item,
      context.airModels,
      context.airSeries,
      context.airBrands,
      (optimizeFor === "low_noise" || optimizeFor === "low_power" ? optimizeFor : "balanced") as AcOptimizeFor,
      item.existing_selection?.trim() || undefined,
      true,
    );
    if (!result) {
      missing.push(`${tag}: Matching TDS unavailable for ${item.existing_selection || item.series_name || "KINAIR air curtain"} ; scheduled model retained without substitution`);
      unresolved.add(index);
      continue;
    }
    const best = result.selection;
    models.push(best.arrangement);
    const printedAir = String(item.existing_selection ?? "").trim();
    if (printedAir && normalize(printedAir.replace(/^1\s*[x×]\s*/i, "")) !== normalize(best.arrangement.replace(/^1\s*[x×]\s*/i, ""))) {
      corrections.push(`${tag}: ${printedAir} → ${best.arrangement}`);
    }
    airRows.push({
      tag,
      quantity: item.quantity!,
      duty: `${doorWidthMm} mm x ${doorHeightM} m opening`,
      label: best.arrangement,
      selection: best,
      doorWidthMm,
      doorHeightM,
      minFloorVelocity: item.min_floor_velocity ?? 2,
      specified: { doorWidthMm, doorHeightMm: doorHeightM * 1000 },
      sourceProposed: item.source_has_proposed || item.proposed || item.existing_selection ? { ...item.proposed, model: item.proposed?.model ?? item.existing_selection ?? "" } : undefined,
      accessories: item.accessories ?? "",
      remarks: item.remarks ?? "",
    });
  }

  const unresolvedRows = items.flatMap((item, index) => {
    const tag = item.tag?.trim() || `Item ${index + 1}`;
    if (!unresolved.has(index)) return [];
    const issue = missing.filter(message => message.startsWith(`${tag}:`)).join("; ");
    const duty = item.product === "fan"
      ? [item.airflow == null ? "" : `${item.airflow} ${item.airflow_unit ?? "CMH"}`, item.static_pressure == null ? "" : `${item.static_pressure} ${item.pressure_unit ?? "Pa"}`].filter(Boolean).join(" @ ")
      : [item.door_width == null ? "" : `${item.door_width} ${item.door_width_unit ?? "mm"}`, item.door_height == null ? "" : `${item.door_height} ${item.door_height_unit ?? "m"}`].filter(Boolean).join(" x ");
    return [[tag, item.product === "fan" ? "Fan" : "Air curtain", item.existing_selection ?? "", item.quantity == null ? "" : String(item.quantity), duty, [item.location, item.area_served].filter(Boolean).join(" / "), issue]];
  });
  if (!items.length) return { models, missing: ["readable fan or air curtain duty"], corrections };
  const built = await makeTdsPdf(fanRows, airRows, models, context, unresolvedRows);
  return { ...built, missing, corrections };
}

/** Run the same fan/air-curtain selection and combined PDF generators as selector chat. */
export async function makeSelectorSubmittalTds(
  schedule: string, additionalDetails: string, catalogue: SeriesModel[], context: SelectorContext,
): Promise<{ file?: File; models: string[]; missing: string[] }> {
  const lines = schedule.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const selected = [...new Map(catalogue.filter((model) => modelPattern(model.code).test(schedule))
    .map((model) => [normalize(model.code), model])).values()];
  const fanRows: ChatScheduleFanRow[] = [];
  const airRows: ChatScheduleAirCurtainRow[] = [];
  const missing: string[] = [];
  for (const model of selected) {
    const pattern = modelPattern(model.code);
    const lineIndex = lines.findIndex((line) => pattern.test(line));
    const segment = lineIndex >= 0 ? [lines[lineIndex - 1], lines[lineIndex], lines[lineIndex + 1]].filter(Boolean).join(" ") : "";
    const details = selected.length === 1 ? segment + " " + schedule + " " + additionalDetails : segment;
    const code = /^KVF-(\d{2,4})(MR|M|P)$/i.exec(model.code);
    if (code) {
      const flow = airflow(details);
      const staticPressure = pressure(details);
      if (!flow || !staticPressure) { missing.push(`${model.code}: airflow and static pressure with units`); continue; }
      const series = (context.database.series ?? []).find((row) => normalize(row.name) === normalize(model.series));
      const matchingFans = context.database.fans.filter((fan) => fan.diameter === Number(code[1]) &&
        (fan.seriesId === series?.id || normalize(fan.series) === normalize(model.series)));
      if (!series || !matchingFans.length) { missing.push(`${model.code}: selector fan model and performance data`); continue; }
      const selections = findOptimalSelections(
        { ...context.database, fans: matchingFans },
        { requiredAirflow: flow.amount, requiredPressure: staticPressure.amount, airflowUnit: flow.unit,
          pressureUnit: staticPressure.unit, seriesId: series.id, frequency: 50 }, 20,
      );
      if (!selections.length) { missing.push(`${model.code}: no selector result at ${flow.amount} ${flow.unit} / ${staticPressure.amount} ${staticPressure.unit}`); continue; }
      fanRows.push({ tag: model.code, quantity: 1,
        duty: `${flow.amount} ${flow.unit} @ ${staticPressure.amount} ${staticPressure.unit}`,
        selection: selections[0], airflowUnit: flow.unit, pressureUnit: staticPressure.unit });
      continue;
    }
    const matched = context.airModels.filter((row) => normalize(row.model) === normalize(model.code));
    const dimensions = opening(details);
    if (!dimensions) { missing.push(`${model.code}: door width and mounting height with units`); continue; }
    if (matched.length !== 1) { missing.push(`${model.code}: unique air curtain selector model`); continue; }
    const result = selectAirCurtains(matched, {
      doorWidthMm: dimensions.width, doorHeightM: dimensions.height, category: matched[0].category,
      speed: "high", minNozzleVelocity: 0, minAirflowCmh: 0, motorType: matched[0].motorType,
      brand: matched[0].brand, seriesId: matched[0].seriesId ?? "any", allowCombinations: false,
      minFloorVelocity: 2, supplyFrequencyHz: 50, selectionBasis: "door",
    }, 10)[0];
    if (!result) { missing.push(`${model.code}: selector cannot verify this door opening`); continue; }
    airRows.push({ tag: model.code, quantity: 1, duty: `${dimensions.width} mm x ${dimensions.height} m opening`,
      label: result.model.model, selection: result, doorWidthMm: dimensions.width,
      doorHeightM: dimensions.height, minFloorVelocity: 2 });
  }
  if (!selected.length) return { models: [], missing: ["exact model code in the material schedule"] };
  if (missing.length) return { models: selected.map((item) => item.code), missing };
  return makeTdsPdf(fanRows, airRows, selected.map((item) => item.code), context);
}


