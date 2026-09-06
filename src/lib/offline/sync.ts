import { SupabaseClient } from '@supabase/supabase-js';
import { localDb, getMeta, setMeta } from './localDb';
import { TABLE_NAMES, TABLE_MAP } from './schema';
import { clearEntries, listPending, markFailed, onOutboxQueued, suppressOutbox } from './outbox';
import { cacheFile, parseStorageRef, primeFileCache } from './fileCache';
import { adoptLocalUserId } from './localAuth';
import { getCloudClient } from './cloudLink';
import { isOnline } from './mode';

/** Buckets whose contents are mirrored locally so logos and drawings work offline. */
const MIRRORED_BUCKETS = ['brand-assets', 'project-datasheets'];

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'never';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  pending: number;
  message?: string;
}

let status: SyncStatus = { state: 'never', lastSyncedAt: null, pending: 0 };
const listeners = new Set<(s: SyncStatus) => void>();

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function onSyncStatus(listener: (s: SyncStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

function cloudClient(): SupabaseClient | null {
  return getCloudClient();
}

/** Remembers which account syncs so the desktop app can reach the cloud without a login screen.
 *  Only the email is stored — never the password. Re-authentication uses the
 *  persisted Supabase session/refresh token instead. */
export async function saveSyncCredentials(email: string) {
  await setMeta('sync_credentials', { email });
}

export async function clearSyncCredentials() {
  await setMeta('sync_credentials', null);
}

export async function hasSyncCredentials(): Promise<boolean> {
  return Boolean(await getMeta<{ email: string } | null>('sync_credentials', null));
}

async function ensureCloudSession(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.auth.getSession();
  if (data.session) return true;
  // No live session: try renewing via the persisted refresh token (never a stored password).
  const { data: refreshed, error } = await client.auth.refreshSession();
  return !error && Boolean(refreshed.session);
}

/* ------------------------------------------------------------------ */
/* pull: cloud -> local                                                */
/* ------------------------------------------------------------------ */

async function pullTables(client: SupabaseClient): Promise<void> {
  for (const table of TABLE_NAMES) {
    const def = TABLE_MAP[table];
    const pk = def?.primaryKey ?? 'id';
    const { data, error } = await client.from(table as any).select('*');
    if (error || !data) continue;

    // A read that comes back empty is almost always row-level-security filtering,
    // not a genuinely empty table — never let it wipe bundled/offline data.
    if (data.length === 0) continue;

    await suppressOutbox(async () => {
      const cloudIds = new Set(data.map((row: any) => row[pk]));

      // A cloud read is row-level-security filtered, so it is only authoritative
      // for the tenants it actually returned. Deleting anything outside that set
      // would wipe bundled data the signed-in user simply cannot see.
      const pulledTenants = new Set(
        data.map((row: any) => row?.tenant_id).filter((id: unknown) => typeof id === 'string'),
      );
      const localRows = await localDb.rows<Record<string, any>>(table).toArray();
      const stale = localRows
        .filter((row) => {
          if (cloudIds.has(row[pk])) return false;
          // Only rows in a tenant this pull covered can be safely treated as deleted.
          return typeof row.tenant_id === 'string' && pulledTenants.has(row.tenant_id);
        })
        .map((row) => row[pk]);

      if (stale.length) await localDb.rows(table).bulkDelete(stale);
      await localDb.rows(table).bulkPut(data as any);
    });

  }
}


async function pullFiles(client: SupabaseClient): Promise<void> {
  // Collect every storage reference held in the mirrored tables.
  const refs = new Set<string>();
  const collectRefs = (value: unknown, key = ''): void => {
    if (typeof value === 'string') {
      const bucketHint = key === 'datasheet_url' ? 'project-datasheets' : 'brand-assets';
      const ref = parseStorageRef(value, /url$/i.test(key) || key === 'datasheet_url' ? bucketHint : undefined);
      if (ref && MIRRORED_BUCKETS.includes(ref.bucket)) refs.add(`${ref.bucket}::${ref.path}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectRefs(item, key));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([nestedKey, nestedValue]) =>
        collectRefs(nestedValue, nestedKey),
      );
    }
  };
  for (const table of TABLE_NAMES) {
    const rows = await localDb.rows<Record<string, unknown>>(table).toArray();
    rows.forEach((row) => collectRefs(row));
  }

  for (const entry of refs) {
    const [bucket, path] = entry.split('::');
    const existing = await localDb.files.get(`${bucket}/${path}`);
    if (existing && !existing.pending) continue;
    const { data } = await client.storage.from(bucket).download(path);
    if (data) await cacheFile(bucket, path, data, false);
  }
}

/* ------------------------------------------------------------------ */
/* push: local -> cloud                                                */
/* ------------------------------------------------------------------ */

async function pushOutbox(client: SupabaseClient): Promise<number> {
  const entries = await listPending();
  const done: number[] = [];
  let lastError: string | null = null;

  for (const entry of entries) {
    const def = TABLE_MAP[entry.table];
    if (!def) {
      if (entry.id) done.push(entry.id);
      continue;
    }
    try {
      if (entry.op === 'delete') {
        const { error } = await client.from(entry.table as any).delete().eq(def.primaryKey, entry.rowId);
        if (error) throw error;
      } else {
        const { error } = await client.from(entry.table as any).upsert(entry.payload as any);
        if (error) throw error;
      }
      if (entry.id) done.push(entry.id);
    } catch (error) {
      // Never stop the whole queue on one bad row — that is what left changes
      // stuck forever. Count the failure, keep going, drop it after MAX_ATTEMPTS.
      lastError = error instanceof Error ? error.message : 'Upload rejected by the cloud';
      await markFailed(entry, lastError);
    }
  }

  await clearEntries(done);
  lastPushError = lastError;
  return done.length;
}

async function pushFiles(client: SupabaseClient): Promise<void> {
  const pending = await localDb.files.filter((f) => f.pending).toArray();
  for (const file of pending) {
    const { error } = await client.storage
      .from(file.bucket)
      .upload(file.objectPath, file.blob, { upsert: true, contentType: file.contentType });
    if (!error) await localDb.files.put({ ...file, pending: false });
  }
}

/* ------------------------------------------------------------------ */
/* orchestration                                                       */
/* ------------------------------------------------------------------ */

let syncing = false;
let lastPushError: string | null = null;

export async function syncNow(options?: { silent?: boolean }): Promise<SyncStatus> {
  if (syncing) return status;
  const client = cloudClient();
  if (!client) {
    emit({ state: 'offline', message: 'No cloud connection configured' });
    return status;
  }
  if (!isOnline()) {
    emit({ state: 'offline', message: 'No internet connection' });
    return status;
  }

  syncing = true;
  emit({ state: 'syncing', message: undefined });

  try {
    const signedIn = await ensureCloudSession(client);
    if (!signedIn) {
      emit({ state: 'error', message: 'Sync sign-in required — add cloud credentials in Settings' });
      return status;
    }

    await pushOutbox(client);
    await pushFiles(client);
    await pullTables(client);
    await pullFiles(client);
    await ensureLocalProfile();
    await primeFileCache();

    const now = new Date().toISOString();
    await setMeta('last_synced_at', now);
    emit({
      state: 'idle',
      lastSyncedAt: now,
      pending: await localDb.outbox.count(),
      message: lastPushError ? `Some changes were rejected: ${lastPushError}` : undefined,
    });
  } catch (error) {
    emit({
      state: 'error',
      message: error instanceof Error ? error.message : 'Sync failed',
    });
  } finally {
    syncing = false;
    if (!options?.silent) {
      /* status already emitted */
    }
  }

  return status;
}

/**
 * Binds local data ownership to the signed-in cloud user. No account is ever
 * fabricated locally — access requires a real online login.
 */
export async function ensureLocalProfile(): Promise<void> {
  const client = getCloudClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;
  adoptLocalUserId(userId);

  // Mirror this user's own profile and role so the desktop app can verify
  // approval/admin status offline. Without it the selector shows the
  // "approval pending" screen and no fan models are listed.
  try {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      client.from('user_roles').select('*').eq('user_id', userId),
    ]);
    await suppressOutbox(async () => {
      if (profile) await localDb.rows('profiles').put(profile as any);
      if (roles?.length) await localDb.rows('user_roles').bulkPut(roles as any);
    });
  } catch {
    /* best effort — keeps whatever the mirror already holds */
  }
}




/**
 * Loads the bundled snapshot. Runs per row: any bundled record that is not in
 * the local database is restored, so a table that was emptied or partially
 * wiped (e.g. by a restricted cloud read) heals itself on the next launch.
 * Rows that already exist are left untouched so local/cloud edits survive.
 */
async function seedIfEmpty(): Promise<void> {
  try {
    const seed = (await import('@/data/offlineSeed.json')).default as Record<string, unknown[]>;
    await suppressOutbox(async () => {
      for (const [table, rows] of Object.entries(seed)) {
        if (!TABLE_NAMES.includes(table) || !Array.isArray(rows) || rows.length === 0) continue;
        const pk = TABLE_MAP[table]?.primaryKey ?? 'id';
        const existing = new Set(
          (await localDb.rows(table).toCollection().primaryKeys()) as unknown as string[],
        );
        const missing = (rows as any[]).filter((row) => !existing.has(row?.[pk]));
        if (missing.length) await localDb.rows(table).bulkPut(missing as any);
      }
    });
  } catch {
    // No snapshot bundled — the first online sync fills the database instead.
  }

  await setMeta('seeded', true);
}


let initialised = false;

export async function initOfflineRuntime(): Promise<void> {
  if (initialised) return;
  initialised = true;

  await seedIfEmpty();
  await ensureLocalProfile();
  await primeFileCache();

  const lastSyncedAt = await getMeta<string | null>('last_synced_at', null);
  emit({
    state: isOnline() ? 'idle' : 'offline',
    lastSyncedAt,
    pending: await localDb.outbox.count(),
  });

  // Opportunistic sync on launch and whenever the connection returns.
  void syncNow({ silent: true });
  window.addEventListener('online', () => void syncNow({ silent: true }));
  window.addEventListener('offline', () => emit({ state: 'offline', message: 'No internet connection' }));

  // Sync as soon as the window is used again, so cloud edits show up quickly.
  window.addEventListener('focus', () => {
    if (isOnline()) void syncNow({ silent: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isOnline()) void syncNow({ silent: true });
  });

  // Periodic background sync while online.
  window.setInterval(() => {
    if (isOnline()) void syncNow({ silent: true });
  }, 20 * 1000);

  // Push immediately when something is edited, so the queue never sits idle.
  let queueTimer: number | undefined;
  onOutboxQueued(() => {
    if (!isOnline()) return;
    window.clearTimeout(queueTimer);
    queueTimer = window.setTimeout(() => void syncNow({ silent: true }), 1500);
  });
}

