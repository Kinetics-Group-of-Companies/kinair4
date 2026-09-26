import { useRef, useState } from "react";
import { Building2, ChevronDown, FileText, ImagePlus, Plus, Stamp, Tag, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { idbDel, idbSet, uploadSubmittalFile } from "@/lib/submittal-lite/idb";
import { brandCategories, companyCategories, productCategories, tplKey, uid, type Brand, type Company, type Doc, type Slot } from "@/lib/submittal-lite/library";
import { normalizeUpload, normalizeUploads, uploadAccept } from "@/lib/submittal-lite/uploads";
import { countPdfPages } from "@/lib/submittal-lite/pdf-pages";

const readImage = (file: File | undefined, set: (v: string) => void) => {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      set(canvas.toDataURL("image/png"));
    }
    URL.revokeObjectURL(url);
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
};

async function storeFiles(files: File[], category: string, onProgress: (percent: number) => void): Promise<Doc[]> {
  const out: Doc[] = [];
  for (const f of await normalizeUploads(files)) {
    const pages = await countPdfPages(f);
    const id = uid();
    await uploadSubmittalFile(`doc:${id}`, f, onProgress);
    out.push({ id, name: f.name, type: f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : ""), category, size: f.size, pages });
  }
  return out;
}

function DocList({ docs, categories, onChange, label }: { docs: Doc[]; categories: string[]; onChange: (d: Doc[]) => void; label: string }) {
  const [cat, setCat] = useState(categories[0] ?? "Other");
  const { toast } = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select aria-label={`${label} document type`} value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border-0 bg-card px-2 text-xs font-bold shadow-clay-sm">{categories.map((c) => <option key={c}>{c}</option>)}</select>
        <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-clay-sm">
          <Upload className="size-3.5" /> Add files
          <input type="file" multiple disabled={progress !== null} accept={uploadAccept} className="hidden" aria-label={`Upload ${label} documents`} onChange={async (e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) { try { setProgress(0); onChange([...docs, ...(await storeFiles(f, cat, setProgress))]); } catch (error) { toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } finally { setProgress(null); } } }} />
        </label>
      </div>
      {progress !== null && <p role="status" className="text-xs">Uploading document: {progress}%</p>}
      {docs.length > 0 ? (
        <ul className="space-y-1">{docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-1.5 text-xs">
            <FileText className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
            <select aria-label={`Type of ${d.name}`} value={d.category} onChange={(e) => onChange(docs.map((x) => (x.id === d.id ? { ...x, category: e.target.value } : x)))} className="max-w-[9rem] rounded-lg border-0 bg-background px-1 py-0.5 text-[10px] font-bold">{[...new Set([...categories, d.category])].map((c) => <option key={c}>{c}</option>)}</select>
            <button type="button" onClick={async () => { try { await idbDel(`doc:${d.id}`); onChange(docs.filter((x) => x.id !== d.id)); } catch (error) { toast({ title: "Could not remove file", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } }} aria-label={`Delete ${d.name}`} className="p-1 text-muted-foreground"><Trash2 className="size-3.5" /></button>
          </li>
        ))}</ul>
      ) : <p className="text-[10px] font-semibold text-muted-foreground">No documents yet.</p>}
    </div>
  );
}

function ImgSlot({ src, label, icon, onPick }: { src?: string | undefined; label: string; icon: React.ReactNode; onPick: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl bg-card p-3 text-center text-[11px] font-bold shadow-clay-sm">
      {src ? <img src={src} alt="" className="h-9 max-w-full object-contain" /> : icon}{label}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={`Upload ${label}`} onChange={(e) => { readImage(e.target.files?.[0], onPick); e.target.value = ""; }} />
    </label>
  );
}

function CompanyCard({ c, open, onToggle, onChange, onDelete }: { c: Company; open: boolean; onToggle: () => void; onChange: (c: Company) => void; onDelete: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const slot = useRef<Slot>("cover");
  const { toast } = useToast();
  return (
    <div className="rounded-2xl bg-background/80 p-3">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        {c.logo ? <img src={c.logo} alt="" className="size-9 rounded-lg bg-card object-contain p-0.5" /> : <Building2 className="size-9 rounded-lg bg-card p-2 text-primary" />}
        <span className="flex-1 truncate text-sm font-extrabold">{c.name || "Unnamed company"}</span>
        <span className="text-[10px] font-bold text-muted-foreground">{c.docs.length} docs</span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <Input value={c.name} onChange={(e) => onChange({ ...c, name: e.target.value })} placeholder="Company name" aria-label="Company name" className="h-10 rounded-xl bg-card font-bold" />
          <div className="grid grid-cols-2 gap-2">
            <ImgSlot src={c.logo} label="Company logo" icon={<ImagePlus className="size-5 text-primary" />} onPick={(v) => onChange({ ...c, logo: v })} />
            <ImgSlot src={c.stamp} label="Company stamp" icon={<Stamp className="size-5 text-primary" />} onPick={(v) => onChange({ ...c, stamp: v })} />
          </div>
          <div>
            <p className="text-[11px] font-bold">Default pages & templates</p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">Upload an optional divider background. Cover and index pages are generated from the submittal fields and index.</p>
            <input ref={ref} type="file" accept={uploadAccept} className="hidden" onChange={async (e) => { const raw = e.target.files?.[0]; e.target.value = ""; if (!raw) return; try { const f = await normalizeUpload(raw); const selectedSlot = slot.current; const bytes = await f.arrayBuffer(); await idbSet(tplKey(c.id, selectedSlot), bytes, f.type); onChange({ ...c, tpl: { ...c.tpl, [selectedSlot]: { name: f.name, type: f.type, size: bytes.byteLength } } }); } catch (error) { toast({ title: "Template upload failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } }} />
            <div className="mt-1.5 space-y-1.5">{(["divider"] as Slot[]).map((s) => (
              <div key={s} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-1.5">
                <span className="w-24 text-[11px] font-extrabold capitalize">Divider</span>
                 <span className="flex-1 truncate text-[11px] font-semibold text-muted-foreground">{c.tpl[s]?.name ?? "Plain page"}</span>
                {c.tpl[s] && <button type="button" aria-label={`Remove ${s} template`} className="p-1" onClick={async () => { try { await idbDel(tplKey(c.id, s)); const t = { ...c.tpl }; delete t[s]; onChange({ ...c, tpl: t }); } catch (error) { toast({ title: "Could not remove template", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } }}><X className="size-3.5" /></button>}
                <Button variant="outline" size="sm" className="h-8" onClick={() => { slot.current = s; ref.current?.click(); }}><Upload /> {c.tpl[s] ? "Replace" : "Upload"}</Button>
              </div>
            ))}</div>
          </div>
          <div><p className="mb-1.5 text-[11px] font-bold">Company documents</p><DocList docs={c.docs} categories={companyCategories} onChange={(docs) => onChange({ ...c, docs })} label={c.name} /></div>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}><Trash2 /> Delete company</Button>
        </div>
      )}
    </div>
  );
}

function BrandCard({ b, open, onToggle, onChange, onDelete }: { b: Brand; open: boolean; onToggle: () => void; onChange: (b: Brand) => void; onDelete: () => void }) {
  const [newSeries, setNewSeries] = useState("");
  const count = b.docs.length + b.series.reduce((n, s) => n + s.docs.length, 0);
  return (
    <div className="rounded-2xl bg-background/80 p-3">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        {b.logo ? <img src={b.logo} alt="" className="h-9 w-12 rounded-lg bg-card object-contain p-0.5" /> : <Tag className="size-9 rounded-lg bg-card p-2 text-primary" />}
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold">{b.name || "Unnamed brand"}</span><span className="block truncate text-[10px] font-semibold text-muted-foreground">{b.series.map((s) => s.name).join(", ") || "No series yet"}</span></span>
        <span className="text-[10px] font-bold text-muted-foreground">{count} docs</span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input value={b.name} onChange={(e) => onChange({ ...b, name: e.target.value })} placeholder="Brand name (e.g. VTS)" aria-label="Brand name" className="h-10 rounded-xl bg-card font-bold" />
            <ImgSlot src={b.logo} label="Logo" icon={<ImagePlus className="size-4 text-primary" />} onPick={(v) => onChange({ ...b, logo: v })} />
          </div>
          <div><p className="mb-1.5 text-[11px] font-bold">Manufacturer / brand documents</p><DocList docs={b.docs} categories={brandCategories} onChange={(docs) => onChange({ ...b, docs })} label={b.name} /></div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold">Product series</p>
            {b.series.map((s) => (
              <div key={s.id} className="space-y-2 rounded-xl border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <Input value={s.name} onChange={(e) => onChange({ ...b, series: b.series.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)) })} aria-label="Series name" className="h-9 rounded-lg bg-card text-sm font-bold" />
                  <Button variant="ghost" size="icon" aria-label={`Delete series ${s.name}`} onClick={() => { s.docs.forEach((d) => void idbDel(`doc:${d.id}`)); onChange({ ...b, series: b.series.filter((x) => x.id !== s.id) }); }}><Trash2 /></Button>
                </div>
                <DocList docs={s.docs} categories={productCategories} onChange={(docs) => onChange({ ...b, series: b.series.map((x) => (x.id === s.id ? { ...x, docs } : x)) })} label={s.name} />
              </div>
            ))}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newSeries.trim()) return; onChange({ ...b, series: [...b.series, { id: uid(), name: newSeries.trim(), docs: [] }] }); setNewSeries(""); }}>
              <Input value={newSeries} onChange={(e) => setNewSeries(e.target.value)} placeholder="New series (e.g. AHU, FCU, Air curtain)" aria-label="New series name" className="h-10 rounded-xl bg-card" />
              <Button type="submit" variant="outline" size="sm" className="h-10"><Plus /> Add</Button>
            </form>
          </div>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}><Trash2 /> Delete brand</Button>
        </div>
      )}
    </div>
  );
}

type Props = {
  open: boolean; onClose: () => void; tab: "companies" | "brands"; setTab: (t: "companies" | "brands") => void;
  companies: Company[]; setCompanies: (fn: (c: Company[]) => Company[]) => void;
  brands: Brand[]; setBrands: (fn: (b: Brand[]) => Brand[]) => void;
};

export function LibraryManager({ open, onClose, tab, setTab, companies, setCompanies, brands, setBrands }: Props) {
  const [openId, setOpenId] = useState<string>();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/35 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="mgr-title">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-card p-5 shadow-clay sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div><p className="text-[11px] font-bold uppercase text-primary">KINAIR workspace · cloud synced</p><h2 id="mgr-title" className="font-display text-xl font-semibold">Companies & brands</h2></div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl bg-background/70 p-1.5">
          {(["companies", "brands"] as const).map((t) => <Button key={t} variant={t === tab ? "default" : "ghost"} className="h-10 rounded-xl text-xs font-bold capitalize" onClick={() => setTab(t)}>{t === "companies" ? <Building2 /> : <Tag />} {t}</Button>)}
        </div>
        {tab === "companies" ? (
          <div className="space-y-2">
            {companies.map((c) => <CompanyCard key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? undefined : c.id)} onChange={(n) => setCompanies((l) => l.map((x) => (x.id === n.id ? n : x)))} onDelete={() => { if (!confirm(`Delete ${c.name}?`)) return; c.docs.forEach((d) => void idbDel(`doc:${d.id}`)); setCompanies((l) => l.filter((x) => x.id !== c.id)); }} />)}
            <Button variant="outline" className="w-full" onClick={() => { const id = uid(); setCompanies((l) => [...l, { id, name: "", tpl: {}, docs: [] }]); setOpenId(id); }}><Plus /> Add company</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {brands.map((b) => <BrandCard key={b.id} b={b} open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? undefined : b.id)} onChange={(n) => setBrands((l) => l.map((x) => (x.id === n.id ? n : x)))} onDelete={() => { if (!confirm(`Delete ${b.name}?`)) return; setBrands((l) => l.filter((x) => x.id !== b.id)); }} />)}
            <Button variant="outline" className="w-full" onClick={() => { const id = uid(); setBrands((l) => [...l, { id, name: "", docs: [], series: [] }]); setOpenId(id); }}><Plus /> Add brand</Button>
          </div>
        )}
        <Button variant="default" size="default" className="mt-5 w-full" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

export function DocPicker({ open, onClose, title, groups, onPick }: { open: boolean; onClose: () => void; title: string; groups: { label: string; docs: Doc[] }[]; onPick: (d: Doc) => void }) {
  const [q, setQ] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/35 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="pick-title">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 shadow-clay sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase text-primary">Add to: {title}</p><h2 id="pick-title" className="font-display text-xl font-semibold">Saved documents</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="mb-3 h-11 rounded-xl bg-background" />
        {groups.map((g) => { const docs = g.docs.filter((d) => `${d.name} ${d.category}`.toLowerCase().includes(q.toLowerCase())); return docs.length ? (
          <div key={g.label} className="mb-3"><p className="mb-1 text-[11px] font-extrabold uppercase text-muted-foreground">{g.label}</p>
            <ul className="space-y-1.5">{docs.map((d) => <li key={d.id} className="flex items-center gap-2 rounded-xl bg-background/70 p-2.5"><FileText className="size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{d.name}</p><p className="text-[10px] font-semibold text-muted-foreground">{d.category}</p></div><Button variant="default" size="sm" onClick={() => onPick(d)}><Plus /> Add</Button></li>)}</ul>
          </div>) : null; })}
        {groups.every((g) => g.docs.length === 0) && <p className="p-6 text-center text-sm font-semibold text-muted-foreground">No saved documents. Add them under Companies & brands.</p>}
      </div>
    </div>
  );
}
