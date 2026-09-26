import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/backend/client";
import type { SeriesModel } from "./schedule-series";

const SHARED_TENANT = "00000000-0000-0000-0000-000000000001";
const norm = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const value = (raw: unknown, unit = "") => raw == null || raw === "" ? "" : `${raw}${unit ? " " + unit : ""}`;
type Spec = { model: string; series: string; rows: [string, string][]; fanId?: string; performance?: string[][] };

/** Build a model-level technical sheet using only values saved in the selector database. */
export async function generateSelectorModelDatasheet(
  scheduleText: string, catalogue: SeriesModel[], tenantId: string,
): Promise<{ file: File; models: string[] } | null> {
  const input = scheduleText.toUpperCase().replace(/[‐‑–—]/g, "-");
  const matched = catalogue.filter(({ code }) => {
    const fan = /^KVF-(\d{2,4})(MR|M|P)$/i.exec(code);
    const airN = /^FM-(\d{4})N/i.exec(code);
    const airXD = /^FM-(\d{4})XD/i.exec(code);
    const airL = /^FM-(\d{4})-L/i.exec(code);
    const stem = fan ? `KVF[\\s._-]*${fan[1]}[\\s._-]*${fan[2]}`
      : airN ? `FM[\\s._-]*${airN[1]}[\\s._-]*N`
      : airXD ? `FM[\\s._-]*${airXD[1]}[\\s._-]*XD`
      : airL ? `FM[\\s._-]*${airL[1]}[\\s._-]*L`
      : code.split(/[^A-Z0-9]+/).filter(Boolean).join("[\\s._-]*");
    return stem.length >= 6 && new RegExp("(^|[^A-Z0-9])" + stem + "(?=$|[^A-Z0-9])", "i").test(input);
  });
  if (!matched.length) return null;
  const matchedCodes = new Set(matched.map((item) => norm(item.code)));
  const tenants = [...new Set([tenantId, SHARED_TENANT])];
  const [fanSeries, fanModels, airSeries, airModels] = await Promise.all([
    supabase.from("fan_series").select("id,name").eq("tenant_id", SHARED_TENANT),
    supabase.from("fan_models").select("id,series_id,model_name,product_code,diameter,motor_poles,reference_poles,insulation_class,ip_rating,weight").eq("tenant_id", SHARED_TENANT),
    supabase.from("air_curtain_series").select("id,name").in("tenant_id", tenants),
    supabase.from("air_curtain_models").select("series_id,model,brand,category,motor_type,length_mm,input_power_w,input_power_low_w,air_velocity_ms,air_velocity_low_ms,air_volume_cmh,air_volume_low_cmh,noise_db,noise_low_db,net_weight_kg,mounting_height_min,mounting_height_max,voltage,frequency_hz,remarks").in("tenant_id", tenants),
  ]);
  for (const result of [fanSeries, fanModels, airSeries, airModels]) {
    if (result.error) throw result.error;
  }
  const fanNames = new Map((fanSeries.data ?? []).map((row) => [row.id, row.name]));
  const airNames = new Map((airSeries.data ?? []).map((row) => [row.id, row.name]));
  const specs: Spec[] = [];
  for (const row of fanModels.data ?? []) {
    const series = fanNames.get(row.series_id);
    if (!series) continue;
    const suffix = /^KVF-(MR|M|P)$/i.exec(series)?.[1];
    const code = row.product_code || (suffix && /^\d{2,4}$/.test(String(row.model_name || row.diameter || ""))
      ? `KVF-${row.model_name || row.diameter}${suffix}` : "");
    if (!code || !matchedCodes.has(norm(code))) continue;
    specs.push({ model: code, series, fanId: row.id, rows: [
      ["Fan size", value(row.diameter, "mm")], ["Motor poles", Array.isArray(row.motor_poles) ? row.motor_poles.join(", ") : ""],
      ["Reference poles", value(row.reference_poles)], ["Motor insulation class", value(row.insulation_class)],
      ["IP rating", value(row.ip_rating)], ["Weight", value(row.weight, "kg")],
    ].filter((entry): entry is [string, string] => Boolean(entry[1])) });
  }
  for (const row of airModels.data ?? []) {
    const series = airNames.get(row.series_id);
    if (!series || !matchedCodes.has(norm(row.model))) continue;
    specs.push({ model: row.model, series, rows: [
      ["Brand", value(row.brand)], ["Mounting", value(row.category)], ["Motor", value(row.motor_type)],
      ["Length", value(row.length_mm, "mm")], ["Input power (high)", value(row.input_power_w, "W")],
      ["Input power (low)", value(row.input_power_low_w, "W")], ["Outlet velocity (high)", value(row.air_velocity_ms, "m/s")],
      ["Outlet velocity (low)", value(row.air_velocity_low_ms, "m/s")], ["Air volume (high)", value(row.air_volume_cmh, "m3/h")],
      ["Air volume (low)", value(row.air_volume_low_cmh, "m3/h")], ["Noise (high)", value(row.noise_db, "dB(A)")],
      ["Noise (low)", value(row.noise_low_db, "dB(A)")], ["Net weight", value(row.net_weight_kg, "kg")],
      ["Mounting height minimum", value(row.mounting_height_min, "m")], ["Mounting height maximum", value(row.mounting_height_max, "m")],
      ["Voltage", value(row.voltage)], ["Frequency", value(row.frequency_hz, "Hz")], ["Remarks", value(row.remarks)],
    ].filter((entry): entry is [string, string] => Boolean(entry[1])) });
  }
  if (!specs.length) return null;
  // The same blade configurations and performance points used by the fan selector.
  // Publish reference curves without inventing a selected project operating point.
  for (const spec of specs.filter((item) => item.fanId)) {
    const configs = await supabase.from("blade_configurations")
      .select("id,blade_count").eq("fan_model_id", spec.fanId!);
    if (configs.error) throw configs.error;
    const ids = (configs.data ?? []).map((item) => item.id);
    if (!ids.length) continue;
    const points = await supabase.from("performance_data")
      .select("blade_config_id,blade_angle,motor_poles,point_index,airflow,static_pressure,shaft_power,efficiency")
      .in("blade_config_id", ids).order("point_index").range(0, 999);
    if (points.error) throw points.error;
    if ((points.data ?? []).length === 1000) throw new Error(`Too many performance points for ${spec.model}; review in the fan selector.`);
    const bladeCounts = new Map((configs.data ?? []).map((item) => [item.id, item.blade_count]));
    spec.performance = (points.data ?? []).map((point) => [
      value(bladeCounts.get(point.blade_config_id)), value(point.blade_angle, "deg"),
      value(point.motor_poles), value(point.airflow), value(point.static_pressure),
      value(point.shaft_power), value(point.efficiency),
    ]);
  }
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  specs.forEach((spec, index) => {
    if (index) pdf.addPage();
    pdf.setFillColor(13, 61, 130); pdf.rect(0, 0, 210, 31, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16);
    pdf.text("KINAIR TECHNICAL DATA SHEET", 15, 19);
    pdf.setTextColor(31, 41, 55); pdf.setFontSize(13); pdf.text(spec.model, 15, 45);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(`Series: ${spec.series}`, 15, 52);
    pdf.setFontSize(8); pdf.setTextColor(92, 104, 121);
    pdf.text("Model reference specifications; project duty points require a verified selector selection.", 15, 60);
    autoTable(pdf, {
      startY: 68, head: [["Parameter", "Selector database value"]], body: spec.rows,
      margin: { left: 15, right: 15 }, theme: "grid", styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [13, 61, 130] },
    });
    if (spec.performance?.length) {
      const y = ((pdf as any).lastAutoTable?.finalY ?? 100) + 11;
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(31, 41, 55);
      pdf.text("Fan selector reference performance points", 15, y);
      autoTable(pdf, {
        startY: y + 4,
        head: [["Blades", "Angle", "Poles", "Airflow m3/h", "Static Pa", "Shaft kW", "Eff. %"]],
        body: spec.performance, margin: { left: 15, right: 15 }, theme: "striped",
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [13, 61, 130] },
      });
    }
  });
  return {
    file: new File([pdf.output("blob")], "KINAIR-Selector-Technical-Data.pdf", { type: "application/pdf" }),
    models: specs.map((spec) => spec.model),
  };
}
