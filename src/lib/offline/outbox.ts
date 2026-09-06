import { localDb, OutboxEntry } from './localDb';

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
type QueueListener = () => void;
const queueListeners = new Set<QueueListener>();

/** A change that keeps failing this many times is dropped so the queue can never jam. */
export const MAX_ATTEMPTS = 5;

/** Set while the sync engine writes cloud data into the local mirror, so pulls don't re-queue. */
let suppressed = false;

export function suppressOutbox<T>(fn: () => Promise<T>): Promise<T> {
  suppressed = true;
  return fn().finally(() => {
    suppressed = false;
  });
}

export async function queueMutation(
  table: string,
  op: OutboxEntry['op'],
  rowId: string,
  payload: Record<string, unknown> | null,
): Promise<void> {
  if (suppressed) return;

  // Collapse repeated edits of the same row so the queue doesn't inflate.
  if (op !== 'delete') {
    const existing = await localDb.outbox.filter((e) => e.table === table && e.rowId === rowId && e.op !== 'delete').toArray();
    const ids = existing.map((e) => e.id!).filter(Boolean);
    if (ids.length) await localDb.outbox.bulkDelete(ids);
  }

  await localDb.outbox.add({
    table,
    op,
    rowId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  void notify();
  queueListeners.forEach((l) => l());
}

export async function pendingCount(): Promise<number> {
  return localDb.outbox.count();
}

export async function listPending(): Promise<OutboxEntry[]> {
  return localDb.outbox.orderBy('id').toArray();
}

export async function clearEntries(ids: number[]): Promise<void> {
  await localDb.outbox.bulkDelete(ids);
  void notify();
}

export async function markFailed(entry: OutboxEntry, message: string): Promise<boolean> {
  const attempts = (entry.attempts ?? 0) + 1;
  if (!entry.id) return true;
  if (attempts >= MAX_ATTEMPTS) {
    await localDb.outbox.delete(entry.id);
    void notify();
    return true;
  }
  await localDb.outbox.update(entry.id, { attempts, lastError: message });
  void notify();
  return false;
}

/** Removes everything queued — used by the "Discard queued changes" action. */
export async function clearOutbox(): Promise<void> {
  await localDb.outbox.clear();
  void notify();
}

export function onOutboxChange(listener: Listener): () => void {
  listeners.add(listener);
  void notify();
  return () => listeners.delete(listener);
}

/** Fires whenever a new change is queued, so the sync engine can push it right away. */
export function onOutboxQueued(listener: QueueListener): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

async function notify() {
  const count = await pendingCount();
  listeners.forEach((l) => l(count));
}
