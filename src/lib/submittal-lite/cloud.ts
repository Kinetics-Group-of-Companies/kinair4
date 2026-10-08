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

export async function putCloudRecord(tenantId: string, record: SubmittalRecord, expectedUpdatedAt?: string) {
  const row = { id: record.id, tenant_id: tenantId, ref: record.ref, rev: record.rev,
    data: { ...record, ...(expectedUpdatedAt ? { _expectedUpdatedAt: expectedUpdatedAt } : {}) }, updated_at: record.updatedAt };
  const request = expectedUpdatedAt
    ? supabase.from("submittal_lite_records").update(row).eq("tenant_id", tenantId).eq("id", record.id).eq("updated_at", expectedUpdatedAt)
    : supabase.from("submittal_lite_records").insert(row);
  const { data, error } = await request.select("id");
  if (error) throw new Error(error.code === "23505" ? "This reference/revision already exists. Refresh the register and retry." : error.message);
  if (!data?.length) throw new Error("This draft was deleted or changed in another tab. Refresh before saving. Your changes were not overwritten.");
}

export async function removeCloudRecord(tenantId: string, id: string) {
  const { data, error } = await supabase.from("submittal_lite_records").delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Deletion was not confirmed. The draft may already be deleted, or your account may not have delete permission. Refresh the list.");
}

const settingsVersions = new Map<string, string | null>();
const settingsSnapshots = new Map<string, string>();

export async function loadCloudSettings(tenantId: string): Promise<CloudSettings | null> {
  const { data, error } = await supabase.from("submittal_lite_settings").select("data,updated_at").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  settingsVersions.set(tenantId, data?.updated_at ?? null);
  const settings = data?.data as CloudSettings ?? null;
  settingsSnapshots.set(tenantId, JSON.stringify(settings));
  return settings;
}

const settingsWrites = new Map<string, Promise<void>>();

export async function putCloudSettings(tenantId: string, settings: CloudSettings) {
  // Snapshot at enqueue time: subsequent UI edits must not mutate a pending write.
  const serialized = JSON.stringify(settings);
  const previous = settingsWrites.get(tenantId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    if (!settingsVersions.has(tenantId)) throw new Error("Load the company library before saving.");
    if (settingsSnapshots.get(tenantId) === serialized) return;
    const expected = settingsVersions.get(tenantId);
    const row = {tenant_id:tenantId,data:{...JSON.parse(serialized),...(expected ? {_expectedUpdatedAt:expected} : {})},updated_at:new Date().toISOString()};
    const request = expected
      ? supabase.from("submittal_lite_settings").update(row).eq("tenant_id",tenantId).eq("updated_at",expected)
      : supabase.from("submittal_lite_settings").insert(row);
    const {data,error} = await request.select("updated_at");
    if (error || !data?.length) throw new Error("Company/brand library changed in another session. Your older copy was not saved. Refresh before editing.");
    settingsVersions.set(tenantId,data[0].updated_at);
    settingsSnapshots.set(tenantId,serialized);
  });
  settingsWrites.set(tenantId,current);
  try {await current;}
  finally {if(settingsWrites.get(tenantId)===current)settingsWrites.delete(tenantId);}
}
