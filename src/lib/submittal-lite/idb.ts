// Supabase Storage-backed file store for the lightweight submittal builder.
// IndexedDB remains a cache and migration fallback for files uploaded before cloud storage.
import { supabase } from "@/integrations/backend/client";

const DB = "submittals";
const STORE = "files";
const BUCKET = "submittal-control";
let storageTenantId: string | null = null;

export function setSubmittalStorageTenantId(tenantId: string | null) {
  storageTenantId = tenantId;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

function objectPath(key: string) {
  if (!storageTenantId) throw new Error("Your KINAIR tenant could not be loaded. Please refresh and sign in again.");
  return `${storageTenantId}/lite-builder/${key}`;
}

export async function idbGet(key: string): Promise<ArrayBuffer | undefined> {
  if (storageTenantId) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(objectPath(key));
      if (!error && data) return await data.arrayBuffer();
    } catch {
      // Continue to the local cache for offline use and pre-cloud uploads.
    }
  }
  return tx<ArrayBuffer | undefined>("readonly", (s) => s.get(key));
}

function supportedType(value: ArrayBuffer, hinted?: string): string {
  const type = hinted?.split(";")[0]?.trim().toLowerCase();
  if (type === "application/pdf" || type === "image/png" || type === "image/jpeg") return type;
  const bytes = new Uint8Array(value, 0, Math.min(value.byteLength, 8));
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  throw new Error("Only PDF, PNG and JPG files are supported in the Submittal library.");
}

export async function idbSet(key: string, value: ArrayBuffer, contentType?: string): Promise<void> {
  const copy = value.slice(0);
  const path = objectPath(key);
  const { error } = await supabase.storage.from(BUCKET).upload(path, copy, {
    contentType: supportedType(copy, contentType),
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw error;
  try {
    await tx<void>("readwrite", (s) => s.put(copy, key));
  } catch {
    // Supabase Storage is the source of truth; the browser cache is optional.
  }
}

// Large files go directly to Storage in 6 MiB resumable chunks. Avoid reading or
// caching the entire file before the upload begins.
export async function uploadSubmittalFile(key: string, file: File, onProgress?: (percent: number) => void): Promise<void> {
  if (file.size <= 8 * 1024 * 1024) {
    await idbSet(key, await file.arrayBuffer(), file.type);
    onProgress?.(100);
    return;
  }
  if (file.size > 250 * 1024 * 1024) throw new Error("File exceeds the 250 MB Storage limit.");
  const header = await file.slice(0, 8).arrayBuffer();
  const contentType = supportedType(header, file.type);
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error("Please sign in before uploading.");
  const { Upload } = await import("tus-js-client");
  const url = new URL(import.meta.env.VITE_SUPABASE_URL);
  const projectId = url.hostname.split(".")[0];
  const endpoint = `${url.protocol}//${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${session.access_token}`, "x-upsert": "true" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: objectPath(key), contentType, cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024,
      onProgress: (uploaded, total) => onProgress?.(Math.round((uploaded / total) * 100)),
      onError: reject,
      onSuccess: () => resolve(),
    });
    void upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]!);
      upload.start();
    }, reject);
  });
}

export async function idbDel(key: string): Promise<void> {
  if (storageTenantId) {
    const { error } = await supabase.storage.from(BUCKET).remove([objectPath(key)]);
    if (error) throw error;
  }
  try {
    await tx<void>("readwrite", (s) => s.delete(key));
  } catch {
    // The remote object was already removed.
  }
}
