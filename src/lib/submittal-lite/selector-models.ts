import { supabase } from "@/integrations/backend/client";
import type { SeriesModel } from "./schedule-series";

const SHARED_TENANT = "00000000-0000-0000-0000-000000000001";
const db = supabase as any;
const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

function inferProductType(value: string): SeriesModel["productType"] {
  const v = value.toUpperCase();
  if (/\bFAHU\b|FRESH\s*AIR\s*HANDLING/.test(v)) return "FAHU";
  if (/\bMAHU\b|MAKE[-\s]*UP\s*AIR\s*HANDLING/.test(v)) return "MAHU";
  if (/\bECOLOGY\b/.test(v)) return "Ecology";
  if (/\bAHU\b|AIR\s*HANDLING\s*UNIT/.test(v)) return "AHU";
  if (/AIR\s*CURTAIN|N[-\s]?CROSS|N[-\s]?CENTRIFUGAL|XD[-\s]?CENTRIFUGAL|\bWING\b/.test(v)) return "Air Curtains";
  if (/\bFAN\b|KVF|KTAF|KIN[-\s]?E/.test(v)) return "Fan";
  return undefined;
}

type SeriesDoc = {
  series_name?: string | null;
  category?: string | null;
  storage_path?: string | null;
  display_name?: string | null;
};

function tdsForSeries(series: string, docs: SeriesDoc[]) {
  const key = compact(series);
  return docs.find((doc) =>
    compact(String(doc.series_name ?? "")) === key &&
    /datasheet|technical\s*data|selection\s*data/i.test(String(doc.category ?? "") + " " + String(doc.display_name ?? "")));
}

function fanMeta(seriesRow: any, row: any, docs: SeriesDoc[], seriesOverride?: string, baseSeries?: string): Omit<SeriesModel, "code"> {
  const series = seriesOverride || String(seriesRow.name);
  const tds = tdsForSeries(series, docs) || (baseSeries ? tdsForSeries(baseSeries, docs) : undefined);
  return {
    series,
    productType: "Fan",
    selectorKind: "fan",
    baseSeries: baseSeries || String(seriesRow.name),
    seriesId: String(seriesRow.id),
    modelId: row?.id ? String(row.id) : undefined,
    diameter: row?.diameter == null ? undefined : Number(row.diameter),
    remarks: seriesOverride === "KVF-MR"
      ? "Roof application. Uses KVF-M performance data for the same size; output nomenclature uses MR."
      : String(seriesRow.description ?? ""),
    seriesDescription: String(seriesRow.description ?? ""),
    datasheetDescription: String(seriesRow.datasheet_description ?? ""),
    drawingUrl: String(row?.drawing_url ?? seriesRow.drawing_url ?? "") || undefined,
    catalogueUrl: String(seriesRow.catalogue_url ?? "") || undefined,
    iomUrl: String(seriesRow.iom_url ?? "") || undefined,
    tdsStoragePath: tds?.storage_path ?? undefined,
    tdsDisplayName: tds?.display_name ?? undefined,
  };
}

function airMeta(seriesRow: any, row: any, docs: SeriesDoc[]): Omit<SeriesModel, "code"> {
  const series = String(seriesRow.name);
  const tds = tdsForSeries(series, docs);
  return {
    series,
    productType: "Air Curtains",
    selectorKind: "air_curtain",
    baseSeries: series,
    seriesId: String(seriesRow.id),
    modelId: row?.id ? String(row.id) : undefined,
    lengthMm: row?.length_mm == null ? undefined : Number(row.length_mm),
    remarks: String(row?.remarks ?? seriesRow.description ?? ""),
    seriesDescription: String(seriesRow.description ?? ""),
    datasheetDescription: String(seriesRow.datasheet_description ?? ""),
    drawingUrl: String(row?.drawing_url ?? seriesRow.drawing_url ?? "") || undefined,
    catalogueUrl: String(seriesRow.catalogue_url ?? "") || undefined,
    tdsStoragePath: tds?.storage_path ?? undefined,
    tdsDisplayName: tds?.display_name ?? undefined,
  };
}

/**
 * Shared AI/selector registry.
 * Fan and air-curtain models come directly from their live selector tables.
 * Generic/future products can come from Submittal Product List, while a
 * Datasheet saved under the same series is exposed as that series' TDS asset.
 */
export async function loadSelectorModelCatalogue(tenantId: string): Promise<SeriesModel[]> {
  const tenants = [...new Set([tenantId, SHARED_TENANT])];
  const [
    fanSeriesResult, fanModelsResult, airSeriesResult, airModelsResult,
    genericProductsResult, genericModelsResult, seriesDocsResult,
  ] = await Promise.all([
    supabase.from("fan_series").select("id,name,nomenclature_template,fan_type,description,datasheet_description,drawing_url,catalogue_url,iom_url").eq("tenant_id", SHARED_TENANT),
    supabase.from("fan_models").select("id,series_id,model_name,product_code,diameter,drawing_url").eq("tenant_id", SHARED_TENANT),
    supabase.from("air_curtain_series").select("id,name,description,datasheet_description,category,motor_type,drawing_url,catalogue_url").in("tenant_id", tenants),
    supabase.from("air_curtain_models").select("id,series_id,model,remarks,length_mm,drawing_url,motor_type").in("tenant_id", tenants),
    db.from("submittal_products").select("id,name,description").eq("tenant_id", tenantId),
    db.from("submittal_product_models").select("id,product_id,name,code,description").eq("tenant_id", tenantId),
    db.from("submittal_documents").select("series_name,category,storage_path,display_name").eq("tenant_id", tenantId).eq("scope_type", "series"),
  ]);

  for (const result of [fanSeriesResult, fanModelsResult, airSeriesResult, airModelsResult, genericProductsResult, genericModelsResult, seriesDocsResult]) {
    if (result.error) throw result.error;
  }

  const docs = (seriesDocsResult.data ?? []) as SeriesDoc[];
  const fanSeries = new Map((fanSeriesResult.data ?? []).map((row: any) => [row.id, row]));
  const airSeries = new Map((airSeriesResult.data ?? []).map((row: any) => [row.id, row]));
  const models: SeriesModel[] = [];

  for (const row of fanModelsResult.data ?? []) {
    const seriesRow: any = fanSeries.get((row as any).series_id);
    if (!seriesRow) continue;
    const series = String(seriesRow.name);
    const base = fanMeta(seriesRow, row, docs);

    if ((row as any).product_code) models.push({ code: String((row as any).product_code), ...base });

    const size = String((row as any).model_name || (row as any).diameter || "").trim();
    if (!/^\d{2,4}$/.test(size)) continue;

    const template = String(seriesRow.nomenclature_template || "{series}-{size}");
    const templated = template
      .replaceAll("{series}", series)
      .replaceAll("{size}", size)
      .replaceAll("{diameter}", size);
    if (!/[{}]/.test(templated)) models.push({ code: templated, ...base });

    const key = compact(series);
    if (key === "KVFP") models.push({ code: `KVF-${size}P`, ...base });
    else if (key === "KVFM") {
      models.push({ code: `KVF-${size}M`, ...base });
      models.push({ code: `KVF-${size}MR`, ...fanMeta(seriesRow, row, docs, "KVF-MR", "KVF-M") });
    } else if (key === "KVFMR") models.push({ code: `KVF-${size}MR`, ...base });
    else if (key === "KINE") {
      models.push({ code: `KIN-${size}E`, ...base });
      models.push({ code: `KIN-E-${size}`, ...base });
    } else if (key === "KTAF") {
      // Diameter identifies the KTAF family. Poles/blades/angle/power are
      // resolved by the core selector when it builds the exact nomenclature.
      models.push({ code: `KTAF-${size}`, ...base });
      models.push({ code: `KTAF/${size}`, ...base });
    } else {
      // Future fan series: the Admin nomenclature template is the authority.
      models.push({ code: `${series}-${size}`, ...base });
    }
  }

  for (const row of airModelsResult.data ?? []) {
    const seriesRow: any = airSeries.get((row as any).series_id);
    if (!seriesRow || !(row as any).model) continue;
    models.push({ code: String((row as any).model), ...airMeta(seriesRow, row, docs) });
  }

  // Future/non-selector products (AHU, FAHU, MAHU, Ecology, etc.).
  // Product List provides model/code/remarks; a series document uploaded as
  // "Datasheet" provides the TDS asset. If the code contains a known series
  // name (for example VVS), that series is used automatically.
  const productMap = new Map((genericProductsResult.data ?? []).map((row: any) => [String(row.id), row]));
  const docSeries = [...new Set(docs.map((doc) => String(doc.series_name ?? "").trim()).filter(Boolean))];
  for (const row of genericModelsResult.data ?? []) {
    const product: any = productMap.get(String((row as any).product_id));
    if (!product) continue;
    const code = String((row as any).code || (row as any).name || "").trim();
    if (!code) continue;
    const hay = compact([code, (row as any).name, product.name].filter(Boolean).join(" "));
    const detectedSeries = docSeries.find((name) => hay.includes(compact(name)));
    const series = detectedSeries || String(product.name);
    const tds = tdsForSeries(series, docs);
    models.push({
      code,
      series,
      productType: inferProductType([product.name, product.description, series].filter(Boolean).join(" ")),
      selectorKind: "generic",
      seriesId: String(product.id),
      modelId: String((row as any).id),
      remarks: String((row as any).description ?? product.description ?? ""),
      seriesDescription: String(product.description ?? ""),
      tdsStoragePath: tds?.storage_path ?? undefined,
      tdsDisplayName: tds?.display_name ?? undefined,
    });
  }

  // A saved series Datasheet is still useful even before models are entered.
  for (const series of docSeries) {
    const tds = tdsForSeries(series, docs);
    if (!tds) continue;
    models.push({
      code: series,
      series,
      productType: inferProductType(series),
      selectorKind: "generic",
      tdsStoragePath: tds.storage_path ?? undefined,
      tdsDisplayName: tds.display_name ?? undefined,
    });
  }

  return [...new Map(models.map((item) => [
    item.code.toUpperCase() + ":" + item.series.toUpperCase(),
    item,
  ])).values()];
}

export async function loadRegisteredSeriesTds(
  tenantId: string,
  seriesNames: string[],
  catalogue: SeriesModel[],
): Promise<File[]> {
  const wanted = new Set(seriesNames.map(compact));
  const assets = [...new Map(catalogue
    .filter((item) => wanted.has(compact(item.series)) && item.tdsStoragePath)
    .map((item) => [item.tdsStoragePath!, item])).values()];
  const files: File[] = [];
  for (const asset of assets) {
    const { data, error } = await supabase.storage.from("submittal-control").download(asset.tdsStoragePath!);
    if (error || !data) continue;
    files.push(new File([data], asset.tdsDisplayName || `${asset.series} Datasheet.pdf`, {
      type: data.type || "application/pdf",
    }));
  }
  return files;
}
