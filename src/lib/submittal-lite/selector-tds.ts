import { PDFDocument } from "pdf-lib";
import { selectScheduleFan, selectScheduleAirCurtain } from "@/lib/chatSelectionSchedule";
import type { FanOptimizeFor, AcOptimizeFor } from "@/lib/chatOptimize";
import type { FanDimension } from "@/lib/fanData";
import { AIRFLOW_UNITS, PRESSURE_UNITS, findOptimalSelections, type FanDatabase } from "@/lib/fanData";
import { selectAirCurtains, type AirCurtainModel, type AirCurtainBrand, type AirCurtainSeries, type AirCurtainDimensionRow } from "@/lib/airCurtainData";
import { buildCombinedScheduleDatasheet, type ChatScheduleFanRow, type ChatScheduleAirCurtainRow } from "@/lib/chatScheduleDatasheet";
import type { SeriesModel } from "./schedule-series";


function canonicalFanSelection(raw: string | null | undefined, context: SelectorContext): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const hit = compact.match(/^K?V?F(\d{2,4})(MR|M|P)$/);
  if (!hit) return value;
  const diameter = Number(hit[1]);
  const suffix = hit[2];
  const seriesName = `KVF-${suffix}`;
  const series = context.database.series.find((row) =>
    String(row.name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === seriesName.replace(/[^A-Z0-9]/g, ""));
  const exists = context.database.fans.some((fan) =>
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
  const digits = token.match(/\d{4}/)?.[0];
  if (!digits) return value;
  const close = context.airModels.filter((model) => {
    const candidate = String(model.model ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!candidate.includes(digits)) return false;
    return candidate === `FM${token.replace(/^F/, "")}` || token === candidate.replace(/^FM/, "F");
  });
  return close.length === 1 ? close[0].model : value;
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
  airflow?: number | null; airflow_unit?: keyof typeof AIRFLOW_UNITS;
  static_pressure?: number | null; pressure_unit?: keyof typeof PRESSURE_UNITS;
  series_name?: string | null; motor_poles?: number | null; max_noise_db?: number | null;
  door_width?: number | null; door_width_unit?: "mm" | "cm" | "m" | "in";
  door_height?: number | null; door_height_unit?: "mm" | "cm" | "m" | "in";
  mounting?: "surface" | "recessed" | "any"; motor_type?: "AC" | "EC" | "any";
  brand?: string | null; existing_selection?: string | null;
};

function makeTdsPdf(fanRows: ChatScheduleFanRow[], airRows: ChatScheduleAirCurtainRow[], models: string[], context: SelectorContext) {
  return (async () => {
    const doc = await buildCombinedScheduleDatasheet({
      title: "KINAIR selector technical datasheets", rows: fanRows, database: context.database,
      dimensionsMap: context.dimensionsMap, companyName: context.companyName, logoUrl: context.logoUrl,
      airCurtainRows: airRows,
      airCurtainContext: { brands: context.airBrands, series: context.airSeries, dimensions: context.airDimensions },
    });
    const combined = await PDFDocument.load(doc.output("arraybuffer"));
    if (combined.getPageCount() < 3) throw new Error("Selector combined PDF has no technical datasheet pages.");
    const tds = await PDFDocument.create();
    const pages = await tds.copyPages(combined, Array.from({ length: combined.getPageCount() - 2 }, (_, index) => index + 2));
    pages.forEach((page) => tds.addPage(page));
    const bytes = await tds.save();
    return { file: new File([bytes.slice().buffer], "KINAIR-Selector-TDS-Pages-3-onward.pdf", { type: "application/pdf" }),
      models, missing: [] as string[] };
  })();
}

/** Selection Assistant is the authority for schedule rows. Submittal does not re-parse or re-select them. */
export async function makeAssistantSubmittalTds(
  items: AssistantScheduleItem[],
  context: SelectorContext,
  optimizeFor: FanOptimizeFor = "balanced",
): Promise<{ file?: File; models: string[]; missing: string[] }> {
  const fanRows: ChatScheduleFanRow[] = [];
  const airRows: ChatScheduleAirCurtainRow[] = [];
  const models: string[] = [];
  const missing: string[] = [];

  for (const [index, item] of items.entries()) {
    const tag = item.tag?.trim() || `Item ${index + 1}`;
    if (item.product === "fan") {
      if (!item.airflow || item.static_pressure == null) {
        missing.push(`${tag}: airflow and static pressure with units`);
        continue;
      }
      const flowUnit = AIRFLOW_UNITS[item.airflow_unit ?? "CMH"] ? item.airflow_unit ?? "CMH" : "CMH";
      const pressureUnit = PRESSURE_UNITS[item.pressure_unit ?? "Pa"] ? item.pressure_unit ?? "Pa" : "Pa";
      const best = selectScheduleFan(
        item,
        context.database,
        context.dimensionsMap,
        optimizeFor,
        canonicalFanSelection(item.existing_selection, context),
      );
      if (!best) {
        missing.push(`${tag}: Selection Assistant could not verify ${item.existing_selection || item.series_name || "KINAIR fan"} at ${item.airflow} ${flowUnit} / ${item.static_pressure} ${pressureUnit}`);
        continue;
      }
      models.push(best.nomenclature);
      fanRows.push({
        tag,
        quantity: item.quantity && item.quantity > 0 ? Math.round(item.quantity) : 1,
        duty: `${item.airflow} ${flowUnit} @ ${item.static_pressure} ${pressureUnit}`,
        selection: best,
        airflowUnit: flowUnit,
        pressureUnit,
      });
      continue;
    }

    const units = { mm: 1, cm: 10, m: 1000, in: 25.4 };
    if (!item.door_width || !item.door_height) {
      missing.push(`${tag}: door width and mounting height with units`);
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
      canonicalAirCurtainSelection(item.existing_selection, context),
    );
    if (!result) {
      missing.push(`${tag}: Selection Assistant could not verify ${item.existing_selection || item.series_name || "KINAIR air curtain"} at this opening`);
      continue;
    }
    const best = result.selection;
    models.push(best.arrangement);
    airRows.push({
      tag,
      quantity: item.quantity && item.quantity > 0 ? Math.round(item.quantity) : 1,
      duty: `${doorWidthMm} mm x ${doorHeightM} m opening`,
      label: best.arrangement,
      selection: best,
      doorWidthMm,
      doorHeightM,
      minFloorVelocity: item.min_floor_velocity ?? 2,
    });
  }

  if (missing.length || (!fanRows.length && !airRows.length)) {
    return { models, missing: missing.length ? missing : ["readable fan or air curtain duty"] };
  }
  return makeTdsPdf(fanRows, airRows, models, context);
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
      const series = context.database.series.find((row) => normalize(row.name) === normalize(model.series));
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
