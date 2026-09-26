import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import type { PageLabel } from "@/lib/submittal-lite/pdf-build";
import { openPdfBlob } from "@/lib/submittal-lite/pdf-range";

type Props = { bytes?: Uint8Array | undefined; labels: PageLabel[]; building: boolean; rotations?: Record<number, number>; onRotate?: (index: number, delta: number) => void };
type Page = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
  cleanup?: () => void;
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<Page> };

function CurrentPage({ doc, number, rotation }: { doc: PdfDoc; number: number; rotation: number }) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    let rendering: ReturnType<Page["render"]> | undefined;
    let pdfPage: Page | undefined;
    setSrc(undefined);
    void (async () => {
      pdfPage = await doc.getPage(number);
      if (cancelled) return;
      const original = pdfPage.getViewport({ scale: 1 });
      // Cap pixels so even a huge drawing sheet cannot allocate a huge canvas.
      const scale = Math.min(0.85, 900 / original.width, Math.sqrt(1_500_000 / (original.width * original.height)));
      const viewport = pdfPage.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d");
      if (!context) return;
      rendering = pdfPage.render({ canvasContext: context, viewport });
      await rendering.promise;
      if (cancelled) return;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.76));
      if (blob && !cancelled) { url = URL.createObjectURL(blob); setSrc(url); }
      canvas.width = 0; canvas.height = 0;
    })().catch((error) => { if (!cancelled && error?.name !== "RenderingCancelledException") console.error("Page preview failed", error); });
    return () => { cancelled = true; rendering?.cancel(); pdfPage?.cleanup?.(); if (url) URL.revokeObjectURL(url); };
  }, [doc, number]);
  return (
    <div className="mx-auto flex h-[calc(78vh-112px)] min-h-56 w-full items-center justify-center overflow-hidden">
      {src ? <img src={src} alt={`Page ${number}`} className="max-h-full max-w-full rounded-sm bg-background object-contain shadow-clay-sm" style={{ transform: `rotate(${rotation}deg)` }} />
        : <div className="h-full w-full animate-pulse rounded-sm bg-background/80" />}
    </div>
  );
}

export function PdfPreview({ bytes, labels, building, rotations = {}, onRotate }: Props) {
  const [doc, setDoc] = useState<PdfDoc>();
  const [page, setPage] = useState(1);
  const lastWheelAt = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDoc(undefined);
    setPage(1);
    if (!bytes) return;
    let cancelled = false;
    let task: { promise: Promise<unknown>; destroy: () => Promise<void> } | undefined;
    void (async () => {
      task = await openPdfBlob(new Blob([bytes], { type: "application/pdf" }));
      if (cancelled) { await task.destroy(); return; }
      const parsed = await task.promise as PdfDoc;
      if (!cancelled) setDoc(parsed);
    })().catch((error) => { if (!cancelled) console.error("Preview failed", error); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [bytes]);

  const count = doc?.numPages ?? 0;
  const current = Math.max(1, Math.min(page, count || 1));
  const rotation = ((rotations[current - 1] ?? 0) % 360 + 360) % 360;
  // Native non-passive wheel handling keeps the browser from scrolling the inner pane
  // behind the newly selected page. Accumulate small trackpad deltas too.
  useEffect(() => {
    const element = previewRef.current;
    if (!element || !count) return;
    let accumulated = 0;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
      accumulated += delta;
      if (Math.abs(accumulated) < 16 || Date.now() - lastWheelAt.current < 180) return;
      lastWheelAt.current = Date.now();
      const direction = accumulated > 0 ? 1 : -1;
      accumulated = 0;
      scrollRef.current?.scrollTo({ top: 0 });
      setPage((previous) => Math.min(count, Math.max(1, previous + direction)));
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [count]);
  return (
    <div ref={previewRef} className="rounded-3xl bg-card p-3 shadow-clay">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[11px] font-bold uppercase text-muted-foreground">Submittal preview · scroll or drag page slider</p>
        <span className="text-[11px] font-bold text-muted-foreground">{building ? "Updating…" : `${count} pages`}</span>
      </div>
      <div ref={scrollRef} className="h-[78vh] overflow-hidden rounded-2xl bg-secondary/60 p-3">
        {!count ? <p className="p-8 text-center text-sm font-semibold text-muted-foreground">Build a PDF to preview the submittal here.</p> : <>
          <div className="mb-3 flex items-center justify-center gap-2 text-xs font-bold">
            <button type="button" className="rounded-lg bg-card px-3 py-2" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button>
            <label className="flex items-center gap-1">Page <input aria-label="Preview page number" className="w-16 rounded-lg bg-card p-2 text-center" type="number" min={1} max={count} value={current} onChange={(event) => setPage(Math.min(count, Math.max(1, Number(event.target.value) || 1)))} /> of {count}</label>
            <button type="button" className="rounded-lg bg-card px-3 py-2" disabled={current >= count} onClick={() => setPage(current + 1)}>Next</button>
          </div>
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1"><CurrentPage doc={doc!} number={current} rotation={rotation} /></div>
            {count > 1 && <div className="flex w-9 shrink-0 flex-col items-center gap-1" aria-label="Preview page navigation">
              <span className="text-[10px] font-bold text-muted-foreground">1</span>
              <input type="range" aria-label="Drag to preview page" min={1} max={count} step={1} value={current}
                onChange={(event) => setPage(Number(event.target.value))}
                className="min-h-0 w-6 flex-1 cursor-pointer accent-primary"
                style={{ writingMode: "vertical-lr", direction: "ltr" }} />
              <span className="text-[10px] font-bold text-muted-foreground">{count}</span>
            </div>}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            {onRotate && <button type="button" onClick={() => onRotate(current - 1, -90)} className="rounded-full bg-card p-1.5 text-primary shadow-clay-sm" aria-label={`Rotate page ${current} anticlockwise`}><RotateCcw className="h-3.5 w-3.5" /></button>}
            <p className="text-center text-[10px] font-bold text-muted-foreground">Page {current} · {labels[current - 1]?.label}{rotation ? ` · ${rotation}°` : ""}</p>
            {onRotate && <button type="button" onClick={() => onRotate(current - 1, 90)} className="rounded-full bg-card p-1.5 text-primary shadow-clay-sm" aria-label={`Rotate page ${current} clockwise`}><RotateCw className="h-3.5 w-3.5" /></button>}
          </div>
        </>}
      </div>
    </div>
  );
}
