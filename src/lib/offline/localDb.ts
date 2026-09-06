import Dexie, { Table } from 'dexie';
import { TABLES } from './schema';

export interface OutboxEntry {
  id?: number;
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'delete';
  rowId: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  /** how many times pushing this change to the cloud has failed */
  attempts?: number;
  lastError?: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface LocalFile {
  path: string; // `${bucket}/${objectPath}`
  bucket: string;
  objectPath: string;
  blob: Blob;
  contentType: string;
  updatedAt: string;
  /** true until the file has been pushed to cloud storage */
  pending: boolean;
}

class OfflineDatabase extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;
  files!: Table<LocalFile, string>;

  constructor() {
    super('kinair_offline');

    const stores: Record<string, string> = {
      outbox: '++id, table, createdAt',
      meta: 'key',
      files: 'path, bucket, pending',
    };

    // Every mirrored cloud table gets a store keyed by its primary key,
    // with indexes on its foreign keys so filtered reads stay fast.
    for (const def of TABLES) {
      const indexes = def.foreignKeys.map((f) => f.column);
      stores[def.name] = [def.primaryKey, ...indexes].join(', ');
    }

    this.version(1).stores(stores);
  }

  rows<T = Record<string, unknown>>(table: string): Table<T, string> {
    return (this as unknown as Record<string, Table<T, string>>)[table];
  }
}

export const localDb = new OfflineDatabase();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const entry = await localDb.meta.get(key);
  return entry ? (entry.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await localDb.meta.put({ key, value });
}
