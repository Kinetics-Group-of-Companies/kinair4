import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/backend/client";
import type { SubmittalRecord } from "./records";
import type { Brand, Company } from "./library";

const supabase = typedSupabase as unknown as SupabaseClient;

export type CloudSettings = { companies: Company[]; brands: Brand[]; indexTemplates?: { general: string[]; project: string[] }; selection?: { companyId?: string; brandId?: string; seriesIds?: string[]; customProducts?: string[]; stampAll?: boolean } };

export async function loadCloudRecords(tenantId: string): Promise<SubmittalRecord[]> {
  const { data, error } = await supabase.from("submittal_lite_records").select("data").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => row.data as SubmittalRecord);
}

export async function putCloudRecord(tenantId: string, record: SubmittalRecord) {
  const { error } = await supabase.from("submittal_lite_records").upsert({
    id: record.id, tenant_id: tenantId, ref: record.ref, rev: record.rev,
    data: record, updated_at: record.updatedAt,
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function removeCloudRecord(tenantId: string, id: string) {
  const { error } = await supabase.from("submittal_lite_records").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) throw error;
}

export async function loadCloudSettings(tenantId: string): Promise<CloudSettings | null> {
  const { data, error } = await supabase.from("submittal_lite_settings").select("data").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  return data?.data as CloudSettings ?? null;
}

// Serialize workspace settings writes so a slow autosave cannot overwrite a newer template.
const settingsWrites = new Map<string, Promise<void>>();

export async function putCloudSettings(tenantId: string, settings: CloudSettings) {
  const previous = settingsWrites.get(tenantId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    const { error } = await supabase.from("submittal_lite_settings").upsert({
      tenant_id: tenantId, data: settings, updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });
    if (error) throw error;
  });
  settingsWrites.set(tenantId, current);
  try { await current; }
  finally { if (settingsWrites.get(tenantId) === current) settingsWrites.delete(tenantId); }
}
