import { cacheFile, getFileBlob, localUrlFor, removeFile } from './fileCache';
import { localDb } from './localDb';

/**
 * Offline replacement for `supabase.storage`. Files live in IndexedDB and are
 * exposed through blob URLs; uploads are flagged as pending so the sync engine
 * can push them to cloud storage when internet is available.
 */
export function localStorageApi() {
  return {
    from(bucket: string) {
      return {
        async upload(path: string, body: Blob | File | ArrayBuffer, options?: { contentType?: string }) {
          const blob =
            body instanceof Blob
              ? body
              : new Blob([body as ArrayBuffer], { type: options?.contentType ?? 'application/octet-stream' });
          await cacheFile(bucket, path, blob, true);
          return { data: { path, id: path, fullPath: `${bucket}/${path}` }, error: null };
        },
        async update(path: string, body: Blob | File) {
          await cacheFile(bucket, path, body, true);
          return { data: { path }, error: null };
        },
        getPublicUrl(path: string) {
          const url = localUrlFor(bucket, path) ?? '';
          return { data: { publicUrl: url } };
        },
        async createSignedUrl(path: string) {
          const url = localUrlFor(bucket, path);
          return url
            ? { data: { signedUrl: url }, error: null }
            : { data: null, error: { message: 'File is not available offline' } };
        },
        async download(path: string) {
          const blob = await getFileBlob(bucket, path);
          return blob
            ? { data: blob, error: null }
            : { data: null, error: { message: 'File is not available offline' } };
        },
        async remove(paths: string[]) {
          for (const path of paths) await removeFile(bucket, path);
          return { data: paths.map((p) => ({ name: p })), error: null };
        },
        async list(prefix = '') {
          const files = await localDb.files.where('bucket').equals(bucket).toArray();
          return {
            data: files
              .filter((f) => f.objectPath.startsWith(prefix))
              .map((f) => ({ name: f.objectPath, updated_at: f.updatedAt })),
            error: null,
          };
        },
      };
    },
  };
}
