const CHUNK_RELOAD_KEY = 'kinair:chunk-reload';
const STARTUP_RECOVERY_KEY = 'kinair:startup-recovery';
const FAN_DATABASE_KEY = 'kinair_fan_database';

function storageAvailable(storage: Storage): boolean {
  try {
    const key = '__kinair_storage_test__';
    storage.setItem(key, key);
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function isChunkLoadError(reason: unknown): boolean {
  const message = String((reason as { message?: string })?.message ?? reason ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed|Failed to load module script/i.test(message);
}

export function reloadForFreshBundle(): void {
  if (!storageAvailable(window.sessionStorage)) {
    window.location.reload();
    return;
  }

  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  const url = new URL(window.location.href);
  url.searchParams.set('_update', Date.now().toString());
  window.location.replace(url.toString());
}

export function clearChunkReloadGuard(): void {
  if (storageAvailable(window.sessionStorage)) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  }
}

export async function removeLegacyBrowserCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
}

export function recoverFromStartupFailure(): void {
  if (!storageAvailable(window.sessionStorage)) {
    window.location.reload();
    return;
  }

  if (sessionStorage.getItem(STARTUP_RECOVERY_KEY)) return;
  sessionStorage.setItem(STARTUP_RECOVERY_KEY, '1');

  // Only discard the replaceable local catalogue cache. Authentication and
  // online order data are intentionally preserved.
  try {
    localStorage.removeItem(FAN_DATABASE_KEY);
  } catch {
    // Storage can be blocked in private browsing; a reload still helps.
  }

  void removeLegacyBrowserCaches().finally(() => reloadForFreshBundle());
}

export function clearStartupRecoveryGuard(): void {
  if (storageAvailable(window.sessionStorage)) {
    sessionStorage.removeItem(STARTUP_RECOVERY_KEY);
  }
}

function currentEntryScript(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return script?.getAttribute('src') ?? null;
}

export async function checkForPublishedUpdate(): Promise<void> {
  if (document.visibilityState === 'hidden' || window.location.protocol === 'file:') return;

  try {
    const response = await fetch(window.location.href, {
      cache: 'no-store',
      headers: { 'x-kinair-version-check': '1' },
    });
    if (!response.ok) return;

    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const latestSrc = parsed.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
    const activeSrc = currentEntryScript();
    if (latestSrc && activeSrc && latestSrc !== activeSrc) reloadForFreshBundle();
  } catch {
    // A temporary network failure must never interrupt the current session.
  }
}
