import { supabase } from "@/integrations/backend/client";
import { uploadSubmittalFile } from "./idb";

export const SHARE_VALIDITY_SECONDS = 7 * 24 * 60 * 60;
export type ShareResult = { url: string; expiresAt: string };
const pendingShares = new Map<string, Promise<ShareResult>>();
const memoryShares = new Map<string, ShareResult>();
export async function shareFingerprint(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
export function cachedSubmittalShare(tenantId: string, version: string): ShareResult | undefined {
  const key = `kinair-share-v1:${tenantId}:${version}`;
  try {
    const result = memoryShares.get(key) ?? JSON.parse(localStorage.getItem(key) || "null");
    if (result && Date.parse(result.expiresAt) > Date.now() + 60_000 && result.url.replace("?preview=2", "").startsWith(`${window.location.origin}/kinair-submittal#`)) return { ...result, url: result.url.replace("/kinair-submittal#", "/kinair-submittal?preview=2#") };
  } catch { /* Storage can be unavailable in private browsing. */ }
}
export function rememberSubmittalShare(tenantId: string, version: string, result: ShareResult) {
  const key = `kinair-share-v1:${tenantId}:${version}`;
  memoryShares.set(key, result);
  try { localStorage.setItem(key, JSON.stringify(result)); } catch { /* In-memory cache remains available. */ }
}
export async function shareSubmittalPdf(tenantId: string, bytes: Uint8Array): Promise<ShareResult> {
  if (!tenantId || !bytes.byteLength) throw new Error("Build the final PDF before sharing.");
  const version = await shareFingerprint(bytes);
  const cached = cachedSubmittalShare(tenantId, version);
  if (cached) return cached;
  const key = `${tenantId}:${version}`;
  const pending = pendingShares.get(key);
  if (pending) return pending;
  const task = uploadShare(tenantId, bytes).then((result) => {
    rememberSubmittalShare(tenantId, version, result);
    return result;
  }).finally(() => pendingShares.delete(key));
  pendingShares.set(key, task);
  return task;
}
async function uploadShare(tenantId: string, bytes: Uint8Array): Promise<ShareResult> {
  if (!tenantId || !bytes.byteLength) throw new Error("Build the final PDF before sharing.");
  const key = `shares/${crypto.randomUUID()}/Submittal.pdf`;
  // A separate snapshot prevents later edits from changing an already shared PDF.
  await uploadSubmittalFile(key, new File([bytes.slice().buffer], "Submittal.pdf", { type: "application/pdf" }));
  const { data, error } = await supabase.storage.from("submittal-control")
    .createSignedUrl(`${tenantId}/lite-builder/${key}`, SHARE_VALIDITY_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not create a share link.");
  const token = new URL(data.signedUrl).searchParams.get("token");
  if (!token) throw new Error("Could not prepare the branded share link.");
  return { url: `${window.location.origin}/kinair-submittal?preview=2#${token}`, expiresAt: new Date(Date.now() + SHARE_VALIDITY_SECONDS * 1000).toISOString() };
}
