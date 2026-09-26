import { buildSubmittalPdf, type BuildInput } from "./pdf-build";

self.onmessage = async (event: MessageEvent<BuildInput>) => {
  try {
    const result = await buildSubmittalPdf(event.data);
    self.postMessage({ ok: true, result }, [result.bytes.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "PDF assembly failed." });
  }
};
