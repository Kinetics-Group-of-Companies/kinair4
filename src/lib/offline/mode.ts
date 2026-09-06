/**
 * Offline mode is used by the packaged desktop app (loaded from file://) and can
 * be forced during development with `VITE_OFFLINE_MODE=true` or `?offline=1`.
 */
export const isOfflineMode = (() => {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.VITE_OFFLINE_MODE === 'true') return true;
  if (window.location.protocol === 'file:') return true;
  try {
    if (new URLSearchParams(window.location.search).get('offline') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
})();

/** True when the desktop app currently has a usable internet connection. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
