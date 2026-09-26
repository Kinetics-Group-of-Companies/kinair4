import type { BuildInput, PageLabel } from "./pdf-build";

type Result = { bytes: Uint8Array; labels: PageLabel[]; skipped: string[] };

export function buildPdfInWorker(input: BuildInput, signal: AbortSignal): Promise<Result> {
  const worker = new Worker(new URL("./pdf-build.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { finish(); reject(new DOMException("PDF build cancelled", "AbortError")); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: Result; error?: string }>) => {
      finish();
      if (event.data.ok && event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? "PDF assembly failed."));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "PDF worker failed."));
    };
    const transfers = new Set<ArrayBuffer>();
    for (const section of input.sections) for (const file of section.files) {
      if (file.bytes.byteLength > 8 * 1024 * 1024) transfers.add(file.bytes);
    }
    try { worker.postMessage(input, [...transfers]); }
    catch (error) { finish(); reject(error); }
  });
}
