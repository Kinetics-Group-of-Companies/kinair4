import { localDb } from './localDb';
import { BUNDLED_FILES } from './bundledFiles';

/** path (`bucket/objectPath`) -> blob: URL usable by <img src> and PDF generation */
const objectUrls = new Map<string, string>();

export async function primeFileCache(): Promise<void> {
  const files = await localDb.files.toArray();
  for (const file of files) {
    if (!objectUrls.has(file.path)) {
      objectUrls.set(file.path, URL.createObjectURL(file.blob));
    }
  }
}

export async function cacheFile(
  bucket: string,
  objectPath: string,
  blob: Blob,
  pending: boolean,
): Promise<string> {
  const path = `${bucket}/${objectPath}`;
  await localDb.files.put({
    path,
    bucket,
    objectPath,
    blob,
    contentType: blob.type || 'application/octet-stream',
    updatedAt: new Date().toISOString(),
    pending,
  });
  const existing = objectUrls.get(path);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(blob);
  objectUrls.set(path, url);
  return url;
}

export function localUrlFor(bucket: string, objectPath: string): string | null {
  const path = `${bucket}/${objectPath}`;
  return objectUrls.get(path) ?? BUNDLED_FILES[path] ?? null;
}

export async function getFileBlob(bucket: string, objectPath: string): Promise<Blob | null> {
  const file = await localDb.files.get(`${bucket}/${objectPath}`);
  if (file?.blob) return file.blob;
  const bundled = BUNDLED_FILES[`${bucket}/${objectPath}`];
  if (bundled) {
    try {
      const res = await fetch(bundled);
      if (res.ok) return await res.blob();
    } catch {
      /* bundled asset unreachable — treat as missing */
    }
  }
  return null;
}

export async function removeFile(bucket: string, objectPath: string): Promise<void> {
  const path = `${bucket}/${objectPath}`;
  const url = objectUrls.get(path);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(path);
  }
  await localDb.files.delete(path);
}

const STORAGE_PATH_PATTERN =
  /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/;

function storageRefFromUrl(raw: string): { bucket: string; path: string } | null {
  try {
    const url = new URL(raw);
    const match = decodeURIComponent(url.pathname).match(STORAGE_PATH_PATTERN);
    return match ? { bucket: match[1], path: match[2] } : null;
  } catch {
    return null;
  }
}

/**
 * Replaces cloud storage URLs stored in table rows with locally cached blob URLs
 * so images and drawings keep working with no internet.
 */
export function rewriteStorageUrls<T>(value: T): T {
  if (typeof value === 'string') {
    const ref = storageRefFromUrl(value);
    if (ref) {
      const local = localUrlFor(ref.bucket, ref.path);
      if (local) return local as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteStorageUrls(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      output[key] = rewriteStorageUrls(val);
    }
    return output as unknown as T;
  }
  return value;
}

/** Extracts `{ bucket, path }` from a stored URL or a bare storage path. */
export function parseStorageRef(
  raw: string,
  defaultBucket?: string,
): { bucket: string; path: string } | null {
  if (!raw) return null;
  const ref = storageRefFromUrl(raw);
  if (ref) return ref;
  if (defaultBucket && !raw.startsWith('http') && !raw.startsWith('blob:')) {
    return { bucket: defaultBucket, path: raw };
  }
  return null;
}
