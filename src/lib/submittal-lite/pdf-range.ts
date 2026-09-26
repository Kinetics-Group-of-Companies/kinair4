// PDF.js reads only byte ranges needed for the page tree and the visible page.
// Blob.slice avoids copying a 100+ MB PDF into a second ArrayBuffer.
export async function openPdfBlob(blob: Blob) {
  if (!blob.size) throw new Error("Selected PDF is empty. Please choose the file again.");
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const chunkSize = 64 * 1024;
  const initial = new Uint8Array(await blob.slice(0, chunkSize).arrayBuffer());
  class BlobRangeTransport extends pdfjs.PDFDataRangeTransport {
    private cancelled = false;
    constructor() { super(blob.size, initial, initial.byteLength === blob.size); }
    requestDataRange(begin: number, end: number) {
      void blob.slice(begin, end).arrayBuffer().then((buffer) => {
        if (!this.cancelled) this.onDataRange(begin, new Uint8Array(buffer));
      }).catch(() => { if (!this.cancelled) this.onDataRange(begin, null); });
    }
    abort() { this.cancelled = true; }
  }
  return pdfjs.getDocument({ range: new BlobRangeTransport(), disableAutoFetch: true, disableStream: true, rangeChunkSize: chunkSize });
}
