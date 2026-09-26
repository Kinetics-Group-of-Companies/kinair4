import { supabase } from "@/integrations/backend/client";
import type { SeriesModel } from "./schedule-series";

const SHARED_TENANT = "00000000-0000-0000-0000-000000000001";

/** Lightweight model catalogue used by the selectors; avoid loading performance curves. */
export async function loadSelectorModelCatalogue(tenantId: string): Promise<SeriesModel[]> {
  const tenants = [...new Set([tenantId, SHARED_TENANT])];
  const [fanSeriesResult, fanModelsResult, airSeriesResult, airModelsResult] = await Promise.all([
    supabase.from("fan_series").select("id,name,nomenclature_template").eq("tenant_id", SHARED_TENANT),
    supabase.from("fan_models").select("series_id,model_name,product_code,diameter").eq("tenant_id", SHARED_TENANT),
    supabase.from("air_curtain_series").select("id,name").in("tenant_id", tenants),
    supabase.from("air_curtain_models").select("series_id,model").in("tenant_id", tenants),
  ]);
  for (const result of [fanSeriesResult, fanModelsResult, airSeriesResult, airModelsResult]) {
    if (result.error) throw result.error;
  }
  const fanSeries = new Map((fanSeriesResult.data ?? []).map((row) => [row.id, row]));
  const airNames = new Map((airSeriesResult.data ?? []).map((row) => [row.id, row.name]));
  const models: SeriesModel[] = [];
  for (const row of fanModelsResult.data ?? []) {
    const seriesRow = fanSeries.get(row.series_id);
    const series = seriesRow?.name;
    if (!series) continue;
    if (row.product_code) models.push({ code: row.product_code, series });

    const size = String(row.model_name || row.diameter || "").trim();
    if (!/^\d{2,4}$/.test(size)) continue;

    // Build the same size-level model aliases used by the selector/admin data.
    // Full KTAF nomenclature also depends on poles/blades/angle/power, so the
    // diameter aliases below identify the series while the core selector builds
    // the final exact nomenclature after selection.
    const template = String(seriesRow?.nomenclature_template || "{series}-{size}");
    const templated = template
      .replaceAll("{series}", series)
      .replaceAll("{size}", size)
      .replaceAll("{diameter}", size);
    if (!/[{}]/.test(templated)) models.push({ code: templated, series });

    const compactSeries = series.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (compactSeries === "KVFP") models.push({ code: `KVF-${size}P`, series });
    else if (compactSeries === "KVFM") {
      models.push({ code: `KVF-${size}M`, series });
      // KVF-MR is the roof-application variant of KVF-M and shares its performance data.
      models.push({ code: `KVF-${size}MR`, series: "KVF-MR" });
    }
    else if (compactSeries === "KVFMR") models.push({ code: `KVF-${size}MR`, series });
    else if (compactSeries === "KINE") {
      models.push({ code: `KIN-${size}E`, series });
      models.push({ code: `KIN-E-${size}`, series });
    } else if (compactSeries === "KTAF") {
      models.push({ code: `KTAF-${size}`, series });
      models.push({ code: `KTAF/${size}`, series });
    }
  }
  for (const row of airModelsResult.data ?? []) {
    const series = airNames.get(row.series_id);
    if (series && row.model) models.push({ code: row.model, series });
  }
  return [...new Map(models.map((item) => [item.code.toUpperCase() + ":" + item.series.toUpperCase(), item])).values()];
}
