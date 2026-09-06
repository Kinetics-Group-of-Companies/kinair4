import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isOfflineMode } from "./lib/offline/mode";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import {
  checkForPublishedUpdate,
  clearChunkReloadGuard,
  clearStartupRecoveryGuard,
  isChunkLoadError,
  reloadForFreshBundle,
  removeLegacyBrowserCaches,
  recoverFromStartupFailure,
} from "./lib/appRecovery";

// Self-heal after a new deployment: if the browser is holding a stale index.html
// that points at chunk files which no longer exist, reload once from the network.
function handleStaleBundle(reason: unknown) {
  if (isChunkLoadError(reason)) reloadForFreshBundle();
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => handleStaleBundle((e as unknown as { payload?: unknown }).payload ?? e));
  window.addEventListener("error", (e) => handleStaleBundle(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => handleStaleBundle(e.reason));
  window.addEventListener("load", () => {
    window.setTimeout(clearChunkReloadGuard, 10_000);
    window.setTimeout(clearStartupRecoveryGuard, 10_000);
    void removeLegacyBrowserCaches();
    void checkForPublishedUpdate();
  });
  window.addEventListener("focus", () => void checkForPublishedUpdate());
  document.addEventListener("visibilitychange", () => void checkForPublishedUpdate());
  window.setInterval(() => void checkForPublishedUpdate(), 60_000);
}

async function bootstrap() {
  if (isOfflineMode) {
    // Desktop build: load the local database (and bundled snapshot) before render.
    const { initOfflineRuntime } = await import("./lib/offline/sync");
    await initOfflineRuntime();
  }

  const root = document.getElementById("root");
  if (!root) throw new Error("Application root is missing");

  createRoot(root).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}

void bootstrap().catch((error) => {
  console.error('Application startup failed:', error);
  recoverFromStartupFailure();
});
