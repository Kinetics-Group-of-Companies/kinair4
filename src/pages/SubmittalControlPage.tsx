import { shareSubmittalPdf, shareFingerprint, cachedSubmittalShare, rememberSubmittalShare } from "@/lib/submittal-lite/share";
import { coverFieldKey as coverKey, normalizeCoverFields, isProvidedCoverValue } from "@/lib/submittal-lite/cover-fields";
import { useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Building2, Check, Download, FilePlus2, FileText, FileUp, GripVertical, ImagePlus, LayoutGrid, Library, Loader2, Paperclip, Plus, Save, Settings2, Sparkles, Tag, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PdfPreview } from "@/components/submittal-lite/PdfPreview";
import { DocPicker, LibraryManager } from "@/components/submittal-lite/LibraryManager";
import { SubmittalsHome } from "@/components/submittal-lite/SubmittalsHome";
import { SubmittalChat, type SubmittalChatPlan, type ChatUpload, type ChatInspection } from "@/components/submittal-lite/SubmittalChat";
import { extractText, readScannedPage } from "@/lib/submittal-lite/extract";
import { detectScheduleSeries, seriesProductType, type SeriesModel } from "@/lib/submittal-lite/schedule-series";
import { loadSelectorModelCatalogue } from "@/lib/submittal-lite/selector-models";
import { countPdfPages } from "@/lib/submittal-lite/pdf-pages";
import { buildPdfInWorker } from "@/lib/submittal-lite/pdf-worker-client";
import { idbDel, idbGet, uploadSubmittalFile, setSubmittalStorageTenantId } from "@/lib/submittal-lite/idb";
import { indexHeadingIntent, loadLibrary, matches, saveLibrary, tplKey, uid, type Brand, type Company, type Doc, type Slot } from "@/lib/submittal-lite/library";
import { loadCloudRecords, putCloudRecord, removeCloudRecord, loadCloudSettings, putCloudSettings } from "@/lib/submittal-lite/cloud";
import { nextRef, saveRecords, statusDot, type DocRef, type Field, type IndexMode, type Kind, type Section, type Status, type StampMode, type SubmittalRecord } from "@/lib/submittal-lite/records";
import type { FileData, PageLabel } from "@/lib/submittal-lite/pdf-build";
import { normalizeUploadData, normalizeUploads } from "@/lib/submittal-lite/uploads";
import { MainLayout } from "@/components/layout/MainLayout";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/authContext";
import "@/submittal-lite.css";

type View = "list" | "edit";

const kindLabel: Record<Kind, string> = { Material: "Material Submittal", PQ: "Prequalification Submittal", "O&M": "Operation & Maintenance Manual" };
const sectionDefaults: Record<Kind, string[]> = {
  Material: ["General specification", "Technical data sheet", "Catalogue", "Test certificates", "Manufacturer profile", "Previous approval", "Warranty"],
  PQ: ["Company profile", "Trade license", "Experience list", "ISO certificates", "Organization chart", "Financial statement"],
  "O&M": ["Operation manual", "Maintenance schedule", "As-built drawings", "Spare parts list", "Warranty certificates", "Training records"],
};
const projectIndex = ["Project specification", "Compliance statement", "Technical data sheet", "Catalogue", "Test certificates", "Manufacturer profile", "Previous approval", "Warranty"];
const coverDefaults: Field[] = [
  { label: "Project Name", value: "" }, { label: "Plot No./Location", value: "" }, { label: "Client Name", value: "" },
  { label: "MEP Consultant", value: "" }, { label: "Main Contractor", value: "" },
  { label: "MEP Contractor", value: "" }, { label: "Supplier Name", value: "" },
  { label: "Brand Name", value: "" },
];
function mergeCoverFields(current: Field[], imported: Field[], followImportedOrder = false) {
  const next = normalizeCoverFields(current, true);
  imported = normalizeCoverFields(imported, true);
  for (const field of imported) {
    const at = next.findIndex((f) => coverKey(f.label) === coverKey(field.label));
    if (at >= 0 && (!next[at].value || isProvidedCoverValue(field.value))) next[at] = followImportedOrder
      ? { ...next[at]!, label: field.label, value: field.value }
      : { ...next[at]!, value: field.value };
    else if (at < 0) next.push({ ...field });
  }
  if (!followImportedOrder || !imported.length) return next;
  const importedKeys = new Set(imported.map((f) => coverKey(f.label)));
  // Keep the customer's sequence, followed by any existing fields they did not supply.
  return [...imported.map((f) => next.find((item) => coverKey(item.label) === coverKey(f.label))!), ...next.filter((f) => !importedKeys.has(coverKey(f.label)))];
}
const materialProducts = ["Fan", "Air Curtains", "AHU", "FAHU", "MAHU", "Ecology"];
const inferMaterialProducts = (text: string) => {
  const value = text.toUpperCase();
  const found: string[] = [];
  if (/\b(?:FANS?|KVF|KTAF|KIN[-\s]?E)\b/.test(value)) found.push("Fan");
  if (/\b(?:AIR\s*CURTAINS?|N[-\s]?CROSS\s*FLOW|N[-\s]?CENTRIFUGAL|XD[-\s]?CENTRIFUGAL|WING)\b/.test(value)) found.push("Air Curtains");
  if (/\bFAHU\b|\bFRESH\s*AIR\s*HANDLING\b/.test(value)) found.push("FAHU");
  if (/\bMAHU\b|\bMAKE[-\s]*UP\s*AIR\s*HANDLING\b/.test(value)) found.push("MAHU");
  if (/\bECOLOGY\b|\bECOLOGY\s*UNIT\b|\bKITCHEN\s*EXHAUST\s*ECOLOGY\b/.test(value)) found.push("Ecology");
  if (/\bAHU\b|\bAIR\s*HANDLING\s*UNIT\b/.test(value) && !found.includes("FAHU") && !found.includes("MAHU")) found.push("AHU");
  return [...new Set(found)];
};
const moveArray = <T,>(items: T[], from: number, to: number): T[] => { const next = [...items]; const [item] = next.splice(from, 1); if (item !== undefined) next.splice(to, 0, item); return next; };

const isMaterialSchedule = (title: string) => indexHeadingIntent(title) === "schedule" || /\bmaterial\s+schedules?\b/i.test(title);
const isComplianceStatement = (title: string) => indexHeadingIntent(title) === "compliance" || /\bcompliance\s+(statement|sheet|matrix|report)\b/i.test(title);
const defaultSectionStamp = (title: string): "all" | "divider" => isMaterialSchedule(title) || isComplianceStatement(title) ? "all" : "divider";
const mkSections = (titles: string[], prev: Section[] = []) => {
  const selected = titles.map((t) => { const old = prev.find((p) => p.title.toLowerCase() === t.toLowerCase()); return old ? { ...old, title: t, auto: false } : { id: uid(), title: t, docs: [], stamp: defaultSectionStamp(t) }; });
  // Keep only explicitly uploaded files from old headings for recovery; library docs
  // never create headings outside the chosen index.
  const retained = prev.filter((p) => p.docs.some((d) => !d.auto) && !selected.some((s) => s.id === p.id))
    .map((section) => ({ ...section, docs: section.docs.filter((d) => !d.auto), auto: true }));
  return [...selected, ...retained];
};
const near = (a: string, b: string) => { const x = a.trim().toLowerCase(), y = b.trim().toLowerCase(); return !!x && !!y && (x.includes(y) || y.includes(x)); };

function localParse(cover: string, index: string) {
  const fields: Field[] = [];
  for (const raw of cover.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:\t]{2,40})[:\t]+\s*(.+)$/);
    const last = fields[fields.length - 1];
    if (m) fields.push({ label: (m[1] ?? "").trim(), value: (m[2] ?? "").trim() });
    else if (last) last.value += ` ${line}`;
  }
  const find = (re: RegExp) => fields.find((f) => re.test(f.label))?.value ?? null;
  const sections = index.split(/\r?\n/).map((raw) => raw
    .replace(/^\s*\d+(?:\.\d+)*[.)-]\s*(?=[A-Za-z])/, "")
    .replace(/^\s*(?:(?:\d+(?:\.\d+)+|\d+)[.)-]?|[A-Za-z][.)]|[-•*])\s+/, "")
    .replace(/^\s*\|\s*/, "")
    .replace(/\s*(?:\.{2,}|\||\t)\s*\d+\s*$/, "")
    .replace(/\s+[1-9]\d{0,2}\s*$/, "")
    .trim())
    .filter((line) => line && !/^(?:index|contents|table of contents|sr\.?\s*no\.?|s\.?\s*no\.?|description|page(?: no\.?)?)(?:\s+|$)/i.test(line));
  return { fields, sections, title: find(/title|subject|description/i), brand: find(/brand|manufacturer|make/i), product: find(/product|model|series/i) };
}

// Crop transparent / white margins so every logo fills its frame equally.
async function trimLogo(url?: string): Promise<string | undefined> {
  if (!url || typeof document === "undefined") return url;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx || !c.width || !c.height) return url;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const blank = d[i + 3]! < 20 || (d[i]! > 240 && d[i + 1]! > 240 && d[i + 2]! > 240);
      if (!blank) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return url;
    const o = document.createElement("canvas");
    o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext("2d")!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL("image/png");
  } catch { return url; }
}

async function dataUrlToFile(url?: string, name = "image"): Promise<FileData | undefined> {
  if (!url) return;
  if (name !== "stamp.png") url = await trimLogo(url);
  if (!url) return;
  const match = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (match?.[1] && match[2]) {
    const raw = atob(match[2]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { bytes: bytes.buffer, type: match[1], name };
  }
  const res = await fetch(url);
  if (!res.ok) return;
  return { bytes: await res.arrayBuffer(), type: res.headers.get("content-type") ?? "image/png", name };
}

const docTitle = (d: Doc) => (d.category && d.category !== "Other" ? d.category : d.name.replace(/\.[a-z0-9]+$/i, "")).trim();

const logicalFileNameKey = (name: string) => name
  .toLowerCase()
  .replace(/\.[a-z0-9]+$/i, "")
  .replace(/\b(?:copy|final|rev(?:ision)?\s*\d+|v\d+)\b/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const logicalDocKey = (doc: Doc) => {
  const category = (doc.category || "other").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Do not include size/page metadata here: the same PDF may be re-uploaded or
  // normalized and still be the same logical catalogue/document.
  return `${category}|${logicalFileNameKey(doc.name)}`;
};


function docsForSelection(company: Company | undefined, brand: Brand | undefined, selectedIds: string[]) {
  const selectedNames = new Set(selectedIds.map((id) => {
    if (id.startsWith("default:") || id.startsWith("custom:")) return id.slice(id.indexOf(":") + 1).trim().toLowerCase();
    return brand?.series.find((series) => series.id === id)?.name.trim().toLowerCase() ?? "";
  }).filter(Boolean));
  const selectedSeries = (brand?.series ?? [])
    .filter((series) => selectedIds.includes(series.id) || selectedNames.has(series.name.trim().toLowerCase()));
  const selectedFamilies = new Set(selectedSeries.map((series) => seriesProductType(series.name)).filter(Boolean));
  if (selectedNames.has("fan")) selectedFamilies.add("Fan");
  if (selectedNames.has("air curtains")) selectedFamilies.add("Air Curtains");
  // The library keeps shared approval copies under individual series. Make the
  // relevant family copy available when a product type is chosen without a model.
  const sharedApprovals = (brand?.series ?? [])
    .filter((series) => selectedFamilies.has(seriesProductType(series.name)))
    .flatMap((series) => series.docs.filter((doc) =>
      /approval/i.test(doc.category ?? "") &&
      (seriesProductType(series.name) === "Fan"
        ? /\bfans?\b/i.test(doc.name)
        : /air[\s-]*curtains?/i.test(doc.name))));
  const unique = new Map<string, Doc>();
  const approvalNames = new Set<string>();
  const catalogueKeys = new Set<string>();
  const selectedModelNames = selectedSeries.map((series) => series.name.toUpperCase());
  const explicitlyAssigned = new Set(selectedSeries.flatMap((series) => series.docs.map((doc) => doc.id)));
  for (const doc of [...(company?.docs ?? []), ...(brand?.docs ?? []), ...selectedSeries.flatMap((series) => series.docs), ...sharedApprovals]) {
    // The Admin/Library series assignment is the source of truth. Only use
    // filename series guards for company/brand-level documents that were not
    // explicitly assigned to the selected product series.
    const namedSeries = detectScheduleSeries(doc.name, brand?.series.map((series) => series.name) ?? []).series;
    if (!explicitlyAssigned.has(doc.id) && namedSeries.length &&
        !namedSeries.some((name) => selectedModelNames.includes(name.toUpperCase()))) continue;
    // Trust explicit series/library assignment. A shared OEM certificate can
    // legitimately contain "Cross Flow" in its filename while being mapped to
    // N-Centrifugal / XD-Centrifugal as well. The exact named-series guard above
    // already prevents a document that explicitly names another full series.
    if (/approval/i.test(doc.category ?? "")) {
      const name = doc.name.trim().toLowerCase();
      if (approvalNames.has(name)) continue;
      approvalNames.add(name);
    }
    if (/catalogue/i.test(doc.category ?? "") || /catalog(?:ue|og)/i.test(doc.name)) {
      const key = logicalDocKey(doc);
      if (catalogueKeys.has(key)) continue;
      catalogueKeys.add(key);
    }
    unique.set(doc.id, doc);
  }
  return [...unique.values()];
}

function verifiedAiLibraryDoc(doc: Doc, brand: Brand | undefined, selectedIds: string[], seriesNames: string[]) {
  // AMCA membership is company evidence, not a product test certificate.
  if (/AMCA.*(?:MEMBER|PLAQUE)/i.test(doc.name)) return false;
  const certificate = /(?:test|performance|product).*?(?:report|certificat)/i.test(`${doc.category ?? ""} ${doc.name}`);
  if (!certificate) return true;
  // The user explicitly assigned these OEM files to this exact series in the library.
  if (brand?.series.some((series) => selectedIds.includes(series.id) && series.docs.some((saved) => saved.id === doc.id))) return true;
  const compact = doc.name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return seriesNames.some((name) => compact.includes(name.toUpperCase().replace(/[^A-Z0-9]/g, "")));
}

// Saved company, brand and series documents only fill headings in the chosen index.
// Manually uploaded files from removed headings stay visible for reassignment.
function attach(sections: Section[], pool: Doc[]) {
  const ids = new Set(pool.map((d) => d.id));
  return sections
    .filter((section) => !section.auto || section.docs.some((d) => !d.auto))
    .map((section) => {
      const seen = new Set<string>();
      const kept = section.docs
        .filter((d) => !d.auto || (!section.auto && ids.has(d.id) && matches(section.title, pool.find((doc) => doc.id === d.id)!)))
        .filter((d) => {
          const key = logicalFileNameKey(d.name);
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if (section.auto) return { ...section, docs: kept };
      const add = pool
        .filter((d) => matches(section.title, d))
        .filter((d) => {
          const key = logicalFileNameKey(d.name);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((d) => ({ id: d.id, name: d.name, type: d.type, size: d.size, pages: d.pages, auto: true }));
      return { ...section, docs: [...kept, ...add] };
    });
}

type DragItem = { kind: "field"; index: number } | { kind: "section"; id: string } | { kind: "doc"; sectionId: string; docId: string };
type DragHandlers = {
  onBeginDrag: (event: DragEvent<HTMLElement>, item: DragItem) => void;
  onDropItem: (item: DragItem, target: DragItem) => void;
  dragged: MutableRefObject<DragItem | null>;
};
type DocRowProps = { id: string; name: string; auto?: boolean; sectionId: string; onUp: () => void; onDown: () => void; onRemove: () => void } & DragHandlers;
function DocRow({ id, name, auto, sectionId, onUp, onDown, onRemove, onBeginDrag, onDropItem, dragged }: DocRowProps) {
  return <li className="flex items-center gap-1 rounded-lg px-1 text-xs font-semibold hover:bg-secondary/50"
    onDragOver={(event) => { if (dragged.current?.kind === "doc") { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; } }}
    onDrop={(event) => { if (dragged.current?.kind !== "doc") return; event.preventDefault(); event.stopPropagation(); onDropItem(dragged.current, { kind: "doc", sectionId, docId: id }); dragged.current = null; }}>
    <span draggable aria-label={`Drag document ${name}`} title="Drag to reorder or move to another divider" className="cursor-grab touch-none rounded p-1 text-primary active:cursor-grabbing"
      onDragStart={(event) => onBeginDrag(event, { kind: "doc", sectionId, docId: id })} onDragEnd={() => { dragged.current = null; }}><GripVertical className="size-4" /></span>
    <FileText className="size-3.5 shrink-0 text-primary" /><span className="flex-1 truncate">{name}</span>
    {auto && <span className="rounded-full bg-secondary px-1.5 text-[9px] font-extrabold">AUTO</span>}
    <button type="button" onClick={onUp} aria-label="Move up" className="p-1"><ArrowUp className="size-3.5" /></button>
    <button type="button" onClick={onDown} aria-label="Move down" className="p-1"><ArrowDown className="size-3.5" /></button>
    <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="p-1"><X className="size-3.5" /></button>
  </li>;
}

type BarProps = { s: Section; i: number; onRename: (t: string) => void; onRemove: () => void; onInsert: () => void; onMove: (dir: -1 | 1) => void; onDefault: () => void; onUpload: () => void; onDocMove: (j: number, dir: -1 | 1) => void; onDocRemove: (j: number) => void; onFilesDrop: (files: File[]) => void; stampMode: StampMode; onStamp: (m: StampMode) => void } & DragHandlers;
function Bar({ s, i, onRename, onRemove, onInsert, onMove, onDefault, onUpload, onDocMove, onDocRemove, onFilesDrop, stampMode, onStamp, onBeginDrag, onDropItem, dragged }: BarProps) {
  return <li className="rounded-2xl border border-border bg-card p-3"
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files") || dragged.current?.kind === "section" || dragged.current?.kind === "doc") { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
    onDrop={(event) => {
      const files = Array.from(event.dataTransfer.files);
      if (files.length) { event.preventDefault(); void onFilesDrop(files); return; }
      const item = dragged.current;
      if (!item || item.kind === "field") return;
      event.preventDefault(); onDropItem(item, { kind: "section", id: s.id }); dragged.current = null;
    }}>
    <div className="flex items-center gap-1.5">
      <span draggable aria-label={`Drag divider ${i + 1}`} title="Drag to reorder divider" className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-xl bg-primary text-primary-foreground active:cursor-grabbing"
        onDragStart={(event) => onBeginDrag(event, { kind: "section", id: s.id })} onDragEnd={() => { dragged.current = null; }}><GripVertical className="size-4" /></span>
      <Input value={s.title} onChange={(e) => onRename(e.target.value)} aria-label={`Divider ${i + 1} title`} className="h-9 min-w-0 flex-1" />
      <button type="button" onClick={() => onMove(-1)} aria-label="Move divider up" className="p-1"><ArrowUp className="size-4" /></button>
      <button type="button" onClick={() => onMove(1)} aria-label="Move divider down" className="p-1"><ArrowDown className="size-4" /></button>
      <button type="button" onClick={onRemove} aria-label="Remove divider" className="p-1"><X className="size-4" /></button>
    </div>
    {s.docs.length > 0 && <ul className="mt-2 space-y-1 pl-3">{s.docs.map((d, j) => <DocRow key={d.id} id={d.id} name={d.name} auto={d.auto} sectionId={s.id} onUp={() => onDocMove(j, -1)} onDown={() => onDocMove(j, 1)} onRemove={() => onDocRemove(j)} onBeginDrag={onBeginDrag} onDropItem={onDropItem} dragged={dragged} />)}</ul>}
    <div className="mt-2 flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={onDefault}><Library /> Add saved</Button><Button variant="secondary" size="sm" onClick={onUpload}><Paperclip /> Upload</Button><Button variant="ghost" size="sm" onClick={onInsert}><Plus /> Divider below</Button></div>
    <div className="mt-2 flex flex-wrap items-center gap-1"><span className="mr-1 text-[10px] font-bold uppercase text-muted-foreground">Stamp</span>{([["all", "Divider + docs"], ["divider", "Divider only"], ["none", "No stamp"]] as const).map(([m, l]) => <button key={m} type="button" onClick={() => onStamp(m)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${stampMode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{l}</button>)}</div>
  </li>;
}

function SimpleSubmittalBuilder({ tenantId }: { tenantId: string }) {
  const [view, setView] = useState<View>("list");
  const [kind, setKind] = useState<Kind>("Material");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [seriesIds, setSeriesIds] = useState<string[]>([]);
  const [customProducts, setCustomProducts] = useState<string[]>([]);
  const [customProduct, setCustomProduct] = useState("");
  const [stampAll, setStampAll] = useState(true);
  const [stampCover, setStampCover] = useState(true);
  const [stampIndex, setStampIndex] = useState(true);
  const [useDefaultCover, setUseDefaultCover] = useState(false);
  const [useDefaultIndex, setUseDefaultIndex] = useState(false);
  const [coverText, setCoverText] = useState("");
  const [indexText, setIndexText] = useState("");
  const appliedCustomerIndexText = useRef("");
  const [fields, setFields] = useState<Field[]>(() => coverDefaults.map((f) => ({ ...f })));
  const [indexMode, setIndexMode] = useState<IndexMode>("general");
  const [indexTemplates, setIndexTemplates] = useState<{ general: string[]; project: string[] }>({ general: sectionDefaults.Material, project: projectIndex });
  const [templateDrafts, setTemplateDrafts] = useState<{ general: string; project: string }>({ general: sectionDefaults.Material.join("\n"), project: projectIndex.join("\n") });
  const [savingTemplate, setSavingTemplate] = useState<"general" | "project" | null>(null);
  const [title, setTitle] = useState("");
  const [coverHeading, setCoverHeading] = useState("");
  const [sections, setSections] = useState<Section[]>(() => mkSections(sectionDefaults.Material));
  const [mgrOpen, setMgrOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<SeriesModel[]>([]);
  const [pendingChatDownloadId, setPendingChatDownloadId] = useState<string>();
  const [preparedChatPdfId, setPreparedChatPdfId] = useState<string>();
  const [lastChatPdfReadyId, setLastChatPdfReadyId] = useState<string>();
  const [mobileMode, setMobileMode] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px), (pointer: coarse)").matches);
  const [mgrTab, setMgrTab] = useState<"companies" | "brands">("companies");
  const [pickFor, setPickFor] = useState<string>();
  const [records, setRecords] = useState<SubmittalRecord[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const [status, setStatus] = useState("All");
  const [notice, setNotice] = useState("");
  const [hasPdfIssues, setHasPdfIssues] = useState(false);
  const [reading, setReading] = useState<"" | "cover" | "index" | "build">("");
  const [building, setBuilding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [manualBuildKey, setManualBuildKey] = useState("");
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; labels: PageLabel[] }>();
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);
  const mem = useRef(new Map<string, ArrayBuffer>());
  const barFileRef = useRef<HTMLInputElement>(null);
  const barTarget = useRef("");
  const dragged = useRef<DragItem | null>(null);

  useEffect(() => { if (chatOpen) setChatMounted(true); }, [chatOpen]);
  useEffect(() => { const media = window.matchMedia("(max-width: 767px), (pointer: coarse)"); const sync = () => setMobileMode(media.matches); sync(); media.addEventListener?.("change", sync); return () => media.removeEventListener?.("change", sync); }, []);
  useEffect(() => {
    let cancelled = false;
    void loadSelectorModelCatalogue(tenantId).then((models) => {
      if (!cancelled) setModelCatalog(models);
    }).catch((error) => {
      if (!cancelled) console.warn("Selector model catalogue unavailable", error);
    });
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    (async () => {
      try {
        const previousTenant = localStorage.getItem("submittals:tenant");
        const mayImportLegacy = !previousTenant || previousTenant === tenantId;
        const localLibrary = mayImportLegacy ? await loadLibrary() : { companies: [{ id: uid(), name: "My company", tpl: {}, docs: [] }], brands: [] };
        const remoteLibrary = await loadCloudSettings(tenantId);
        const lib = remoteLibrary ?? localLibrary;
        if (!remoteLibrary) await putCloudSettings(tenantId, lib);
        setCompanies(lib.companies); setBrands(lib.brands);
        if (lib.indexTemplates) {
          setIndexTemplates(lib.indexTemplates);
          setTemplateDrafts({ general: lib.indexTemplates.general.join("\n"), project: lib.indexTemplates.project.join("\n") });
        }
        const sel = remoteLibrary?.selection ?? (mayImportLegacy ? JSON.parse(localStorage.getItem("submittals:sel") ?? "{}") as { companyId?: string; brandId?: string; seriesIds?: string[]; customProducts?: string[]; stampAll?: boolean } : {});
        setCompanyId(lib.companies.some((c) => c.id === sel.companyId) ? sel.companyId! : (lib.companies[0]?.id ?? ""));
        setBrandId(sel.brandId ?? ""); setSeriesIds(sel.seriesIds ?? []); setCustomProducts(sel.customProducts ?? []); setStampAll(sel.stampAll ?? true);
        // Cloud is authoritative. A missing ID can mean deletion by another
        // tab/device; cached records must never be silently re-uploaded.
        const recs = await loadCloudRecords(tenantId);
        setRecords(recs); setView("list");
        localStorage.setItem("submittals:tenant", tenantId);
              setLoaded(true);
      } catch (error) { setNotice(`Cloud data could not load: ${error instanceof Error ? error.message : "Please retry."}`); }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      saveLibrary(companies, brands);
      localStorage.setItem("submittals:sel", JSON.stringify({ companyId, brandId, seriesIds, customProducts, stampAll }));
      saveRecords(records);
    } catch { setNotice("Device storage is full — some settings may not be saved. Use smaller logo and stamp images."); }
  }, [companies, brands, companyId, brandId, seriesIds, customProducts, stampAll, records, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      void putCloudSettings(tenantId, { companies, brands, indexTemplates, selection: { companyId, brandId, seriesIds, customProducts, stampAll } }).catch((error) => setNotice(`Library sync failed: ${error instanceof Error ? error.message : "Please retry."}`));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [companies, brands, indexTemplates, companyId, brandId, seriesIds, customProducts, stampAll, loaded, tenantId]);

  const company = companies.find((c) => c.id === companyId);
  const brand = brands.find((b) => b.id === brandId);
  const availableSeries = useMemo(() => {
    const saved = brand?.series ?? [];
    const defaults = materialProducts.map((name) => ({ id: `default:${name}`, name, docs: [] }));
    const custom = customProducts.filter((name) => !materialProducts.some((item) => item.toLowerCase() === name.toLowerCase())).map((name) => ({ id: `custom:${name}`, name, docs: [] }));
    return [...saved, ...defaults, ...custom];
  }, [brand, customProducts]);
  const chosenSeries = availableSeries.filter((s) => seriesIds.includes(s.id));
  const isProductType = (id: string) => id.startsWith("default:") || id.startsWith("custom:");
  const defaultProductOptions = availableSeries.filter((s) => s.id.startsWith("default:"));
  const customProductOptions = availableSeries.filter((s) => s.id.startsWith("custom:"));
  const brandSeriesOptions = availableSeries.filter((s) => !isProductType(s.id));
  const selectedTypes = chosenSeries.filter((s) => isProductType(s.id)).map((s) => s.name).join(", ");
  const selectedModels = chosenSeries.filter((s) => !isProductType(s.id)).map((s) => s.name).join(", ");
  const selectedProducts = selectedTypes || selectedModels;
  const pool = useMemo(() => docsForSelection(company, brand, seriesIds), [company, brand, seriesIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const poolKey = pool.map((d) => d.id + d.category).join();

  // Auto-load documents whenever company / brand / series or their documents change.
  useEffect(() => { if (loaded) setSections((s) => attach(s, pool)); }, [poolKey, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pasted or uploaded customer indexes create dividers without a second Build click.
  useEffect(() => {
    if (indexMode !== "customer" || !indexText.trim()) return;
    const timer = window.setTimeout(() => {
      const titles = localParse("", indexText).sections;
      if (!titles.length) { setNotice("No divider titles found in the customer index. Put each title on a separate line."); return; }
      setSections((previous) => attach(mkSections(titles, previous), pool));
      appliedCustomerIndexText.current = indexText;
      setNotice(`${titles.length} dividers created from the customer index.`);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [indexText, indexMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const editing = records.find((r) => r.id === editingId);
  const allDocs = sections.filter((section) => !section.auto).flatMap((section) => section.docs);
  const pageTotal = allDocs.reduce((sum, doc) => sum + (doc.pages ?? 1), 0);
  const largeMode = mobileMode || allDocs.some((doc) => (doc.size ?? 0) > 20 * 1024 * 1024) || pageTotal > 100;
  const buildKey = JSON.stringify({ kind, title, coverHeading, fields, sections, indexMode, companyId, brandId, stampAll, stampCover, stampIndex, useDefaultCover, useDefaultIndex, coverDoc: editing?.coverDoc?.id, indexDoc: editing?.indexDoc?.id });

  const normCache = useRef(new Map<string, FileData>());
  const bytesOf = async (id: string) => mem.current.get(id) ?? (await idbGet(`doc:${id}`));
  const tplSig = company ? `${company.id}:${JSON.stringify(company.tpl)}` : "";

  useEffect(() => {
    if (!loaded) return;
    if (largeMode && manualBuildKey !== buildKey) { setPdf(undefined); setBuilding(false); return; }
    let cancelled = false;
    const buildController = new AbortController();
    setBuilding(true);
    const t = setTimeout(async () => {
      try {
        const templates: Partial<Record<Slot, FileData>> = {};
        if (company) for (const s of ["cover", "index", "divider"] as Slot[]) {
          const meta = company.tpl[s];
          const bytes = meta && (await idbGet(tplKey(company.id, s)));
          if (meta && bytes?.byteLength) templates[s] = await normalizeUploadData({ bytes: bytes.slice(0), type: meta.type, name: meta.name });
          else if (meta) setNotice(`${s[0]?.toUpperCase()}${s.slice(1)} template file is missing. Please upload it again in Company settings.`);
        }
        const missingFiles: string[] = [];
        const loadSourceDoc = async (ref?: DocRef): Promise<FileData | undefined> => {
          if (!ref) return undefined;
          const bytes = await bytesOf(ref.id);
          if (!bytes) { missingFiles.push(ref.name); return undefined; }
          return normalizeUploadData({ bytes, type: ref.type, name: ref.name });
        };
        const sourceCover = await loadSourceDoc(editing?.coverDoc);
        const sourceIndex = await loadSourceDoc(editing?.indexDoc);
        const secs: { title: string; stamp: StampMode | undefined; files: FileData[] }[] = [];
        for (const section of sections.filter((item) => !item.auto)) {
          const files: FileData[] = [];
          for (const d of section.docs) {
            const hit = normCache.current.get(d.id);
            if (hit) { files.push(hit); continue; }
            const bytes = await bytesOf(d.id);
            if (!bytes) { missingFiles.push(d.name); continue; }
            const normalized = await normalizeUploadData({ bytes, type: d.type, name: d.name });
            if (bytes.byteLength <= 1024 * 1024) normCache.current.set(d.id, normalized);
            files.push(normalized);
          }
          secs.push({ title: section.title, stamp: section.stamp, files });
          if (cancelled) return;
        }
        const selectionLabels = /^(supplier(?: name)?|submitted by|company|brand(?: name)?|manufacturer|make|product|product type|equipment|model|series)$/i;
        const customerFields = fields.filter((f) => !selectionLabels.test(f.label.trim()));
        const fieldValue = (pattern: RegExp) => fields.find((f) => pattern.test(f.label.trim()))?.value.trim() ?? "";
        const supplierName = fieldValue(/^(supplier(?: name)?|submitted by|company)$/i) || company?.name || "";
        const displayBrand = fieldValue(/^(brand(?: name)?|manufacturer|make)$/i) || brand?.name || "";
        const displayProduct = selectedProducts || fieldValue(/^(product|product type|equipment|model|series)$/i);
        const coverFields = [
          ...customerFields,
          ...(supplierName ? [{ label: "Supplier Name", value: supplierName }] : []),
          ...(displayBrand ? [{ label: "Brand Name", value: displayBrand }] : []),
          ...(displayProduct ? [{ label: "Product", value: displayProduct }] : []),
        ];
        const coverLabel = coverHeading.trim() || (kind === "Material" && selectedProducts ? `Material Submittal for ${selectedProducts}` : kindLabel[kind]);
        if (cancelled) return;
        const out = await buildPdfInWorker({ kindLabel: kindLabel[kind], coverLabel, title, companyName: company?.name, brandName: brand?.name, productName: selectedProducts, fields: coverFields, sections: secs, templates, sourceCover, sourceIndex, useDefaultCover: useDefaultCover && Boolean(company?.tpl.cover), useDefaultIndex: useDefaultIndex && Boolean(company?.tpl.index), companyLogo: await dataUrlToFile(company?.logo, "company.png"), brandLogo: await dataUrlToFile(brand?.logo, "brand.png"), stamp: await dataUrlToFile(company?.stamp, "stamp.png"), stampEveryPage: stampAll, stampCover, stampIndex }, buildController.signal);
        if (!cancelled) {
          setPdf({ bytes: out.bytes, labels: out.labels });
          setHasPdfIssues(Boolean(missingFiles.length || out.skipped.length));
          setNotice([
            missingFiles.length ? `Missing uploaded files: ${[...new Set(missingFiles)].join(", ")}. Re-upload them before downloading.` : "",
            out.skipped.length ? `Could not add: ${out.skipped.join(", ")}. Use PDF, PNG or JPG files.` : "",
          ].filter(Boolean).join(" "));
        }
      } catch (error) { if (!cancelled) { setPdf(undefined); setHasPdfIssues(true); setNotice(error instanceof Error && /docx|word/i.test(error.message) ? "A Word file could not be converted. Please upload it again, or save it as PDF." : "Preview could not be built. Check the uploaded files."); } }
      if (!cancelled) setBuilding(false);
    }, pendingChatDownloadId ? 120 : 1000);
    return () => { cancelled = true; clearTimeout(t); buildController.abort(); };
  }, [loaded, kind, title, fields, sections, tplSig, brand?.logo, brand?.name, company?.logo, company?.stamp, company?.name, selectedProducts, stampAll, stampCover, stampIndex, useDefaultCover, useDefaultIndex, largeMode, manualBuildKey, buildKey, pendingChatDownloadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const readFile = async (which: "cover" | "index", file?: File) => {
    if (!file) return;
    setReading(which);
    try {
      const text = (await extractText(file, readScannedPage)).trim();
      (which === "cover" ? setCoverText : setIndexText)((t) => (t.trim() ? `${t.trim()}\n${text}` : text));
      if (which === "cover") { const parsed = localParse(coverText.trim() ? `${coverText.trim()}\n${text}` : text, ""); if (parsed.fields.length) setFields((previous) => mergeCoverFields(previous, parsed.fields, true)); }
      if (which === "index") { setIndexMode("customer"); setUseDefaultIndex(false); }
      setNotice(`Read ${file.name}. Check the text, then press Build.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "The file could not be read."); }
    setReading("");
  };

  const read = async () => {
    if (!coverText.trim() && !(indexMode === "customer" && indexText.trim())) { setNotice("Paste or upload cover details or a customer index first. Standard dividers are already ready below."); return; }
    setReading("build");
    let err = "";
    let r: { fields: Field[]; sections: string[]; title: string | null; brand: string | null; product: string | null };
    try {
      r = localParse(coverText, indexMode === "customer" ? indexText : "");
    } catch { err = "The local reader was used."; r = localParse(coverText, indexMode === "customer" ? indexText : ""); }
    if (coverText.trim()) setFields((previous) => mergeCoverFields(previous, r.fields, true));
    if (r.title) setTitle(r.title);
    let b = brand;
    if (r.brand) { const hit = brands.find((x) => near(x.name, r.brand!)); if (hit) { b = hit; setBrandId(hit.id); } }
    const hay = `${r.product ?? ""} ${r.title ?? ""}`;
    const sHits = b?.series.filter((s) => near(s.name, hay) || hay.toLowerCase().includes(s.name.toLowerCase())) ?? [];
    if (sHits.length) setSeriesIds(sHits.map((s) => s.id));
    const nextSeriesIds = sHits.length ? sHits.map((s) => s.id) : seriesIds;
    const nextPool = docsForSelection(company, b, nextSeriesIds);
    if (indexMode === "customer" && r.sections.length) setUseDefaultIndex(false);
    setSections((prev) => attach(r.sections.length ? mkSections(r.sections, prev) : prev, nextPool));
    setReading("");
    setNotice(err || `Built: cover with ${r.fields.length} fields and ${r.sections.length || sections.length} dividers${b ? ` · ${b.name} documents loaded` : ""}.`);
  };

  const addFilesToBar = async (secId: string, files: File[]) => {
    const refs: DocRef[] = [];
    try {
      for (const f of await normalizeUploads(files)) {
        const pages = await countPdfPages(f);
        const id = uid();
        setUploadProgress(0);
        await uploadSubmittalFile(`doc:${id}`, f, setUploadProgress);
        if (f.size <= 1024 * 1024) mem.current.set(id, await f.arrayBuffer());
        refs.push({ id, name: f.name, type: f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : ""), size: f.size, pages });
        setSections((current) => current.map((s) => s.id === secId ? { ...s, docs: [...s.docs, refs[refs.length - 1]!] } : s));
      }
    } catch (error) {
      setNotice(error instanceof Error ? `Upload failed: ${error.message}` : "Upload failed. Please try again.");
    } finally {
      setUploadProgress(null);
    }
  };
  const addDocToBar = (secId: string, d: Doc) => setSections((s) => s.map((x) => (x.id === secId && !x.docs.some((k) => k.id === d.id) ? { ...x, docs: [...x.docs, { id: d.id, name: d.name, type: d.type, size: d.size, pages: d.pages }] } : x)));
  const onBeginDrag = (event: DragEvent<HTMLElement>, item: DragItem) => {
    dragged.current = item;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "kinair-submittal-reorder");
  };
  const onDropItem = (item: DragItem, target: DragItem) => {
    if (item.kind === "field" && target.kind === "field") {
      setFields((previous) => item.index === target.index ? previous : moveArray(previous, item.index, target.index));
      return;
    }
    if (item.kind === "section" && target.kind === "section") {
      setSections((previous) => {
        const from = previous.findIndex((section) => section.id === item.id);
        const to = previous.findIndex((section) => section.id === target.id);
        return from < 0 || to < 0 || from === to ? previous : moveArray(previous, from, to);
      });
      return;
    }
    if (item.kind !== "doc" || (target.kind !== "doc" && target.kind !== "section")) return;
    const targetSectionId = target.kind === "doc" ? target.sectionId : target.id;
    setSections((previous) => {
      const source = previous.find((section) => section.id === item.sectionId);
      const destination = previous.find((section) => section.id === targetSectionId);
      if (!source || !destination) return previous;
      const from = source.docs.findIndex((doc) => doc.id === item.docId);
      if (from < 0 || (target.kind === "doc" && item.sectionId === targetSectionId && item.docId === target.docId)) return previous;
      const moved = source.docs[from]!;
      if (item.sectionId === targetSectionId) {
        const to = target.kind === "doc" ? destination.docs.findIndex((doc) => doc.id === target.docId) : destination.docs.length - 1;
        return previous.map((section) => section.id === source.id ? { ...section, docs: moveArray(section.docs, from, Math.max(0, to)) } : section);
      }
      return previous.map((section) => {
        if (section.id === source.id) return { ...section, docs: section.docs.filter((_, index) => index !== from) };
        if (section.id === destination.id) {
          const to = target.kind === "doc" ? section.docs.findIndex((doc) => doc.id === target.docId) : section.docs.length;
          const docs = [...section.docs];
          docs.splice(to < 0 ? docs.length : to, 0, { ...moved, auto: false });
          return { ...section, docs };
        }
        return section;
      });
    });
  };
  const moveDoc = (secId: string, i: number, dir: -1 | 1) => setSections((s) => s.map((x) => { if (x.id !== secId) return x; const j = i + dir; if (j < 0 || j >= x.docs.length) return x; return { ...x, docs: moveArray(x.docs, i, j) }; }));
  const moveBar = (i: number, dir: -1 | 1) => setSections((s) => { const j = i + dir; return j < 0 || j >= s.length ? s : moveArray(s, i, j); });
  const insertBar = (at: number) => setSections((s) => [...s.slice(0, at), { id: uid(), title: "New section", docs: [] }, ...s.slice(at)]);
  const addCustomProduct = () => {
    const name = customProduct.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) return;
    const existing = availableSeries.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) setSeriesIds((ids) => ids.includes(existing.id) ? ids : [...ids, existing.id]);
    else {
      const id = `custom:${name}`;
      setCustomProducts((items) => [...items, name]);
      setSeriesIds((ids) => [...ids, id]);
    }
    setCustomProduct("");
  };

  const download = async () => {
    if (!pdf) return;
    let bytes = pdf.bytes;
    if (Object.values(rotations).some((r) => r % 360 !== 0)) {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdf.bytes.slice());
      doc.getPages().forEach((pg, i) => { const r = rotations[i] ?? 0; if (r % 360) pg.setRotation(degrees((pg.getRotation().angle + r + 360) % 360)); });
      bytes = await doc.save();
    }
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = `${(title || kindLabel[kind]).replace(/[^\w\- ]+/g, "").trim() || "submittal"}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const deleteRecord = async (id: string) => {
    const target = records.find((r) => r.id === id);
    if (!target) return;
    // Let the delete-button interaction paint before scanning records and IndexedDB.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const retained = new Set([
      ...companies.flatMap((c) => c.docs.map((d) => d.id)),
      ...brands.flatMap((b) => [...b.docs, ...b.series.flatMap((s) => s.docs)].map((d) => d.id)),
      ...records.filter((r) => r.id !== id).flatMap((r) => r.sections.flatMap((s) => s.docs.map((d) => d.id))),
    ]);
    const uniqueFiles = new Set(target.sections.flatMap((s) => s.docs.map((d) => d.id)).filter((docId) => !retained.has(docId)));
    try {
      await removeCloudRecord(tenantId, id);
      setRecords((current) => current.filter((r) => r.id !== id));
      try { saveRecords(records.filter(record => record.id !== id)); } catch { /* Cloud deletion remains authoritative. */ }
      if (editingId === id) { setEditingId(""); setView("list"); }
      const cleanup = await Promise.allSettled([...uniqueFiles].map(docId => idbDel(`doc:${docId}`)));
      setNotice(cleanup.some(result => result.status === "rejected")
        ? `${target.ref} deleted. Some unused uploads could not be cleaned up.`
        : `${target.ref} and its unused uploads deleted.`);
    } catch (error) {
      setNotice(`Could not delete ${target.ref}: ${error instanceof Error ? error.message : "Please try again."}`);
    }
  };

  const resetEditor = () => {
    setEditingId(undefined); setKind("Material"); setCoverText(""); setIndexText(""); setFields(coverDefaults.map((f) => ({ ...f }))); setIndexMode("general"); setTitle(""); setCoverHeading(""); setBrandId(""); setSeriesIds([]); setCustomProducts([]); setCustomProduct(""); setUseDefaultCover(false); setUseDefaultIndex(false); setStampAll(false); setStampCover(true); setStampIndex(true);
    setSections(attach(mkSections(indexTemplates.general), [...(company?.docs ?? [])])); setView("edit"); window.scrollTo(0, 0);
  };
  const shareSavedRecord = async (record: SubmittalRecord) => {
    const company = companies.find((item) => item.id === record.companyId);
    const brand = brands.find((item) => item.id === record.brandId);
    if (!company) throw new Error("The supplier settings are missing. Open this submittal to review them.");
    const version = await shareFingerprint(JSON.stringify({ record, company, brand, renderer: "share-v1" }));
    const cached = cachedSubmittalShare(tenantId, version);
    if (cached) return cached;
    const { kind, title, fields, stampAll } = record;
    const coverHeading = record.coverHeading ?? "";
    const stampCover = record.stampCover ?? true;
    const stampIndex = record.stampIndex ?? true;
    const useDefaultCover = false, useDefaultIndex = false;
    const editing = record;
    const sections = attach(record.sections, docsForSelection(company, brand, record.seriesIds));
    const types = record.seriesIds.filter((id) => /^(default|custom):/.test(id)).map((id) => id.slice(id.indexOf(":") + 1));
    const models = (brand?.series ?? []).filter((item) => record.seriesIds.includes(item.id)).map((item) => item.name);
    const selectedProducts = (types.length ? types : models).join(", ");
    const buildController = new AbortController();
        const templates: Partial<Record<Slot, FileData>> = {};
        if (company) for (const s of ["cover", "index", "divider"] as Slot[]) {
          const meta = company.tpl[s];
          const bytes = meta && (await idbGet(tplKey(company.id, s)));
          if (meta && bytes?.byteLength) templates[s] = await normalizeUploadData({ bytes: bytes.slice(0), type: meta.type, name: meta.name });
          else if (meta) throw new Error(`${s[0]?.toUpperCase()}${s.slice(1)} template file is missing. Please upload it again in Company settings.`);
        }
        const missingFiles: string[] = [];
        const loadSourceDoc = async (ref?: DocRef): Promise<FileData | undefined> => {
          if (!ref) return undefined;
          const bytes = await bytesOf(ref.id);
          if (!bytes) { missingFiles.push(ref.name); return undefined; }
          return normalizeUploadData({ bytes, type: ref.type, name: ref.name });
        };
        const sourceCover = await loadSourceDoc(editing?.coverDoc);
        const sourceIndex = await loadSourceDoc(editing?.indexDoc);
        const secs: { title: string; stamp: StampMode | undefined; files: FileData[] }[] = [];
        for (const section of sections.filter((item) => !item.auto)) {
          const files: FileData[] = [];
          for (const d of section.docs) {
            const hit = normCache.current.get(d.id);
            if (hit) { files.push(hit); continue; }
            const bytes = await bytesOf(d.id);
            if (!bytes) { missingFiles.push(d.name); continue; }
            const normalized = await normalizeUploadData({ bytes, type: d.type, name: d.name });
            if (bytes.byteLength <= 1024 * 1024) normCache.current.set(d.id, normalized);
            files.push(normalized);
          }
          secs.push({ title: section.title, stamp: section.stamp, files });
          
        }
        const selectionLabels = /^(supplier(?: name)?|submitted by|company|brand(?: name)?|manufacturer|make|product|product type|equipment|model|series)$/i;
        const customerFields = fields.filter((f) => !selectionLabels.test(f.label.trim()));
        const fieldValue = (pattern: RegExp) => fields.find((f) => pattern.test(f.label.trim()))?.value.trim() ?? "";
        const supplierName = fieldValue(/^(supplier(?: name)?|submitted by|company)$/i) || company?.name || "";
        const displayBrand = fieldValue(/^(brand(?: name)?|manufacturer|make)$/i) || brand?.name || "";
        const displayProduct = selectedProducts || fieldValue(/^(product|product type|equipment|model|series)$/i);
        const coverFields = [
          ...customerFields,
          ...(supplierName ? [{ label: "Supplier Name", value: supplierName }] : []),
          ...(displayBrand ? [{ label: "Brand Name", value: displayBrand }] : []),
          ...(displayProduct ? [{ label: "Product", value: displayProduct }] : []),
        ];
        const coverLabel = coverHeading.trim() || (kind === "Material" && selectedProducts ? `Material Submittal for ${selectedProducts}` : kindLabel[kind]);
        
        const out = await buildPdfInWorker({ kindLabel: kindLabel[kind], coverLabel, title, companyName: company?.name, brandName: brand?.name, productName: selectedProducts, fields: coverFields, sections: secs, templates, sourceCover, sourceIndex, useDefaultCover: useDefaultCover && Boolean(company?.tpl.cover), useDefaultIndex: useDefaultIndex && Boolean(company?.tpl.index), companyLogo: await dataUrlToFile(company?.logo, "company.png"), brandLogo: await dataUrlToFile(brand?.logo, "brand.png"), stamp: await dataUrlToFile(company?.stamp, "stamp.png"), stampEveryPage: stampAll, stampCover, stampIndex }, buildController.signal);

    if (missingFiles.length || out.skipped.length) throw new Error(`Cannot share an incomplete PDF. Missing or unreadable files: ${[...missingFiles, ...out.skipped].join(", ")}. Open the submittal and re-upload them.`);
    const result = await shareSubmittalPdf(tenantId, out.bytes);
    rememberSubmittalShare(tenantId, version, result);
    return result;
  };

  const loadRecord = async (r: SubmittalRecord, asNew = false) => {
    setKind(r.kind); setCoverText(r.coverText); setIndexText(r.indexText); setFields(r.fields.map((field) => ({ ...field }))); setTitle(r.title); setCoverHeading(r.coverHeading ?? "");
    setIndexMode(r.indexMode ?? (r.indexText ? "customer" : "general"));
    const recordCompany = companies.find((c) => c.id === r.companyId) ?? company;
    const recordBrand = brands.find((b) => b.id === r.brandId);
    if (companies.some((c) => c.id === r.companyId)) setCompanyId(r.companyId);
    setBrandId(r.brandId); setSeriesIds(r.seriesIds); setCustomProducts(r.customProducts ?? []); setCustomProduct(""); setStampAll(r.stampAll); setStampCover(r.stampCover ?? true); setStampIndex(r.stampIndex ?? true); setUseDefaultCover(false); setUseDefaultIndex(false);
    setSections(attach(r.sections, docsForSelection(recordCompany, recordBrand, r.seriesIds)));
    if (asNew) {
      const now = new Date().toISOString();
      const copy: SubmittalRecord = { ...r, id: uid(), rev: Math.max(...records.filter((item) => item.ref === r.ref).map((item) => item.rev), r.rev) + 1, status: "Draft", createdAt: now, updatedAt: now, history: [{ status: "Draft", at: now, note: `Resubmission of ${r.ref}${r.rev ? ` Rev ${r.rev}` : ""}` }] };
      try { await putCloudRecord(tenantId, copy); }
      catch (error) { setNotice(`Revision could not be saved: ${error instanceof Error ? error.message : "Please retry."}`); return; }
      setRecords((l) => [copy, ...l]); setEditingId(copy.id); setNotice(`Revision ${copy.rev} of ${copy.ref} created.`);
    } else setEditingId(r.id);
    setView("edit"); window.scrollTo(0, 0);
  };
  const save = async (status?: Status) => {
    const lp = fields.some((f) => f.value.trim()) ? undefined : localParse(coverText, "");
    if (lp?.fields.length) setFields((current) => mergeCoverFields(current, lp.fields));
    const t = title.trim() || lp?.title || fields.find((f) => /title|subject/i.test(f.label))?.value || (selectedProducts ? `${kindLabel[kind]} for ${selectedProducts}` : kindLabel[kind]);
    const now = new Date().toISOString();
    const allFields = mergeCoverFields(fields, lp?.fields ?? []);
    const project = allFields.find((f) => /^(project|project name)$/i.test(f.label.trim()))?.value ?? "";
    const base = { kind, title: t, coverHeading: coverHeading.trim(), project, indexMode, companyId, brandId, seriesIds, customProducts, stampAll, stampCover, stampIndex, useDefaultCover: useDefaultCover && Boolean(company?.tpl.cover), useDefaultIndex: useDefaultIndex && Boolean(company?.tpl.index), coverText, indexText, coverDoc: editing?.coverDoc, indexDoc: editing?.indexDoc, fields: allFields, sections, updatedAt: now };
    if (editing) {
      const st = status ?? editing.status;
      const updated: SubmittalRecord = { ...editing, ...base, status: st, history: st !== editing.status ? [...editing.history, { status: st, at: now }] : editing.history };
      try { await putCloudRecord(tenantId, updated); } catch (error) { setNotice(`Save failed: ${error instanceof Error ? error.message : "Please retry."}`); return; }
      setRecords((l) => l.map((r) => r.id === updated.id ? updated : r));
      setNotice(`${editing.ref} ${status === "Submitted" ? "submitted" : "saved"}.`);
    } else {
      const st = status ?? "Draft";
      const rec: SubmittalRecord = { id: uid(), ref: nextRef(kind, records), rev: 0, status: st, createdAt: now, history: [{ status: st, at: now }], ...base };
      try { await putCloudRecord(tenantId, rec); } catch (error) { setNotice(`Save failed: ${error instanceof Error ? error.message : "Please retry."}`); return; }
      setRecords((l) => [rec, ...l]); setEditingId(rec.id);
      setNotice(`${rec.ref} ${st === "Submitted" ? "submitted" : "saved as draft"}.`);
    }
    if (status === "Submitted") setView("list");
  };
  const setRecordStatus = async (id: string, s: Status, note: string) => {
    const current = records.find((r) => r.id === id);
    if (!current) return;
    const now = new Date().toISOString();
    const updated: SubmittalRecord = { ...current, status: s, updatedAt: now, history: [...current.history, { status: s, at: now, ...(note ? { note } : {}) }] };
    try { await putCloudRecord(tenantId, updated); setRecords((l) => l.map((r) => r.id === id ? updated : r)); }
    catch (error) { setNotice(`Status update failed: ${error instanceof Error ? error.message : "Please retry."}`); }
  };

  const prepareChatRecord = (plan: SubmittalChatPlan, uploads: ChatUpload[] = []): SubmittalRecord => {
    const source = plan.action === "revise" ? records.find((record) => record.id === plan.sourceRecordId) : undefined;
    if (plan.action === "revise" && !source) throw new Error("That revision is not in your register. Specify its saved reference and revision.");
    if (plan.action !== "create" && plan.action !== "revise") throw new Error("Please describe the submittal you need.");
    const now = new Date().toISOString();
    const chatKind = source?.kind ?? plan.kind;
    let selectedBrand = brands.find((item) => near(item.name, plan.brand)) ?? brands.find((item) => item.id === source?.brandId);
    const targetCompany = companies.find((item) => item.id === source?.companyId) ?? company;
    const product = plan.product.trim();
    const scheduleText = uploads.map((upload) => upload.scheduleText ?? upload.documentText ?? "").filter(Boolean).join("\n");
    if (!selectedBrand && scheduleText) {
      const candidates = brands.filter((item) => item.series.some((series) =>
        detectScheduleSeries(scheduleText, [series.name], modelCatalog).series.some((name) => near(name, series.name))));
      if (candidates.length === 1) selectedBrand = candidates[0];
    }
    // Use the same product-type and series controls as the manual builder.
    // Exact series detection avoids interpreting KVF-MR as KVF-M.
    const catalogue = selectedBrand?.series.map((item) => item.name) ?? [];
    const selectionAuthorityText = uploads.flatMap((upload) => upload.selectionItems ?? [])
      .flatMap((item) => [item.series_name ?? "", item.existing_selection ?? ""])
      .filter(Boolean).join("\n");
    const selectionItems = uploads.flatMap((upload) => upload.selectionItems ?? []);
    const fromSelectionAssistant = detectScheduleSeries(selectionAuthorityText, catalogue, modelCatalog).series;
    const fromRequest = detectScheduleSeries(product, catalogue, modelCatalog).series;
    const fromSchedule = detectScheduleSeries(scheduleText, catalogue, modelCatalog).series;
    const seriesNames = [...new Set([...fromSelectionAssistant, ...fromSchedule, ...fromRequest])];
    const inferredTypes = [...new Set(seriesNames.map((name) => seriesProductType(name, modelCatalog)).filter((name): name is string => Boolean(name)))];
    const selectionTypes = [...new Set(selectionItems.map((item) => item.product === "air_curtain" ? "Air Curtains" : item.product === "fan" ? "Fan" : "").filter(Boolean))];
    const explicitTypes = materialProducts.filter((name) => near(name, product));
    const textTypes = inferMaterialProducts(`${product}\n${scheduleText}`);
    // Selection Assistant rows and exact series/model detection are authoritative.
    // Generic words inside a TDS (for example "fan" in an Air Curtain document)
    // must never add another product family after the equipment has been resolved.
    const authoritativeTypes = [...new Set([...selectionTypes, ...inferredTypes])];
    const productTypes = authoritativeTypes.length
      ? authoritativeTypes
      : [...new Set([...explicitTypes, ...textTypes])];
    const modelIds = seriesNames.map((name) => selectedBrand?.series.find((item) =>
      item.name.toUpperCase().replace(/[^A-Z0-9]/g, "") === name.toUpperCase().replace(/[^A-Z0-9]/g, ""))?.id ?? `custom:${name}`);
    const requestedIds = [...productTypes.map((name) => `default:${name}`), ...modelIds];
    const selectedSeriesIds = [...new Set(requestedIds.length ? requestedIds : product
      ? [`custom:${product}`] : (source?.seriesIds ?? []))];
    const selectedCustomProducts = [...new Set([
      ...(source?.customProducts ?? []),
      ...(requestedIds.length ? [] : product ? [product] : []),
      ...seriesNames.filter((_, index) => modelIds[index]?.startsWith("custom:")),
    ])];
    const uploadedIndex = uploads.find((upload) => upload.kind === "index" && upload.documentText);
    const customerTitles = uploadedIndex ? localParse("", uploadedIndex.documentText!).sections : [];
    const hasProjectSpecification = uploads.some((upload) => /project\s*specification/i.test(upload.sectionTitle + " " + upload.file.name));
    const mode = plan.explicitIndexMode && plan.indexMode !== "keep" ? plan.indexMode : customerTitles.length ? "customer" : hasProjectSpecification ? "project"
      : plan.indexMode === "keep" ? (source?.indexMode ?? "general") : plan.indexMode;
    const preset = mode === "project" ? indexTemplates.project : mode === "general"
      ? (chatKind === "Material" ? indexTemplates.general : sectionDefaults[chatKind]) : [];
    const keepExistingIndex = plan.indexMode === "keep" && source && !customerTitles.length && !hasProjectSpecification;
    const initial = keepExistingIndex ? source.sections.map((section) => section.title) : preset;
    const requested = mode === "customer" && customerTitles.length ? customerTitles : plan.sections ?? [];
    // Saved General/Project templates define the index exactly. AI proposals must
    // not append unrelated sections such as drawings or a table of contents.
    const titles = (mode === "customer" && requested.length ? requested
      : keepExistingIndex
        ? [...initial, ...requested.filter((name) => !initial.some((old) => near(old, name)))]
        : initial)
      .filter((name) => !(plan.omitSections ?? []).some((excluded) => near(name, excluded)));
    const importedChatFields = plan.fields.filter((item) => item.label.trim() && item.value.trim());
    const chatFields = mergeCoverFields(source?.fields ?? coverDefaults, importedChatFields, true)
      .filter((field) => field.value.trim());
    if (plan.brand.trim() || selectedBrand) {
      const existing = chatFields.find((field) => coverKey(field.label) === "brandname");
      if (existing) existing.value = plan.brand.trim() || selectedBrand!.name;
    }
    // Use the exact same Company → Brand → selected Series document pool as
    // the manual builder. Do not apply an AI-only filename certificate filter:
    // explicit Library/Admin series assignment is already authoritative.
    const verifiedPool = docsForSelection(targetCompany, selectedBrand, selectedSeriesIds);
    const chatSections = attach(mkSections(titles, source?.sections ?? []), verifiedPool)
      .filter((section) => !(plan.omitSections ?? []).some((excluded) => near(section.title, excluded)));
    const explicitTitle = plan.title.trim();
    const productTitle = chatKind === "Material"
      ? `Material Submittal for ${productTypes.length ? productTypes.join(" & ") : product || "Fan"}`
      : kindLabel[chatKind];
    const projectName = chatFields.find((field) => coverKey(field.label) === "projectname")?.value?.trim() ?? "";
    const chatTitle = projectName || explicitTitle || source?.title || productTitle;
    return {
      ...(source ?? {} as SubmittalRecord),
      id: uid(), ref: source?.ref ?? nextRef(chatKind, records),
      rev: source ? Math.max(...records.filter((item) => item.ref === source.ref).map((item) => item.rev), source.rev) + 1 : 0,
      kind: chatKind, title: chatTitle, coverHeading: plan.coverHeading?.trim() || source?.coverHeading || "", project: projectName || source?.project || "",
      status: "Draft", companyId: targetCompany?.id ?? "", brandId: selectedBrand?.id ?? "",
      seriesIds: selectedSeriesIds, customProducts: selectedCustomProducts, fields: chatFields, sections: chatSections,
      stampAll: source?.stampAll ?? stampAll, stampCover: source?.stampCover ?? true, stampIndex: source?.stampIndex ?? true,
      useDefaultCover: false, useDefaultIndex: false, indexMode: mode,
      coverText: source?.coverText ?? "", indexText: mode === "customer" ? requested.join("\n") : (source?.indexText ?? ""),
      createdAt: now, updatedAt: now,
      history: [{ status: "Draft", at: now, note: source ? `Chat revision of ${source.ref} Rev ${source.rev}` : "Created by submittal chat" }],
    };
  };
  const inspectChatPlan = (plan: SubmittalChatPlan, uploads: ChatUpload[], omitEmpty: boolean): ChatInspection => {
    const record = prepareChatRecord(plan, uploads);
    const resolveSection = (upload: ChatUpload) => {
      if (upload.kind === "cover" || upload.kind === "index") return "";
      if (upload.sectionTitle.startsWith("new:")) return upload.sectionTitle.slice(4).trim().slice(0, 100);
      const scheduleLike = upload.sourceRole === "schedule" || upload.sectionTitle === "Material schedule" || /\bschedule\b/i.test(upload.file.name);
      if (scheduleLike) {
        const materialSchedule = record.sections.find((section) => isMaterialSchedule(section.title));
        return materialSchedule?.title ?? "Material schedule";
      }
      // An unreadable original can still be assigned by its selected purpose or
      // unambiguous document name; OCR is not required to append a PDF.
      if (upload.sectionTitle) {
        const chosen = record.sections.find((section) => section.title.trim().toLowerCase() === upload.sectionTitle.trim().toLowerCase());
        if (chosen) return chosen.title;

      }
      if (upload.sectionTitle) {
        const hint = record.sections.filter((section) => matches(section.title, { id: "", name: upload.sectionTitle, type: upload.file.type, category: "Other" }));
        if (hint.length === 1) return hint[0]!.title;
      }
      const possible = record.sections.filter((section) => matches(section.title, { id: "", name: upload.file.name, type: upload.file.type, category: "Other" }));
      if (possible.length === 1) return possible[0]!.title;
      const schedule = upload.file.name.match(/\b(material|equipment|technical)\s+schedule\b/i);
      return schedule ? `${schedule[1]!.slice(0, 1).toUpperCase()}${schedule[1]!.slice(1).toLowerCase()} schedule` : "";
    };
    const assignments = uploads.map(resolveSection);
    // Customer project details are descriptive, not mandatory schema fields.
    // Never invent/ask for MEP Consultant, Main Contractor or MEP Contractor
    // when the customer did not provide those labels.
    const missingCover = [
      ...(!record.fields.some((field) => coverKey(field.label) === "brandname" && field.value.trim()) && !record.brandId ? ["Brand Name"] : []),
      ...(!record.seriesIds.some((id) => !id.startsWith("default:")) && record.seriesIds.some((id) => id === "default:Fan" || id === "default:Air Curtains") ? ["Exact product series / model"] : !record.seriesIds.length ? ["Product / series"] : []),
      ...((!record.companyId || companies.find((item) => item.id === record.companyId)?.name === "My company")
        && !record.fields.some((field) => coverKey(field.label) === "suppliername" && field.value.trim()) ? ["Supplier Name"] : []),
    ];
    const empty = record.sections.filter((section) => !section.docs.length && !assignments.includes(section.title));
    const catalogue = brands.flatMap((item) => item.series.map((series) => series.name));
    const scheduleUploads = uploads.filter((upload) => upload.sectionTitle === "Material schedule" || Boolean(upload.selectionItems?.length));
    const scheduleModels = detectScheduleSeries(scheduleUploads.map((upload) => upload.scheduleText ?? upload.documentText ?? "").join("\n"), catalogue, modelCatalog);
    const tdsModels = detectScheduleSeries(uploads.filter((upload) =>
      /technical data sheet|datasheet|tds/i.test(upload.sectionTitle))
      .map((upload) => upload.documentText ?? "").join("\n"), catalogue, modelCatalog);
    const detectedModels = detectScheduleSeries(uploads.map((upload) => upload.scheduleText ?? upload.documentText ?? "").join("\n"), catalogue, modelCatalog);
    const tdsFallback = !scheduleModels.series.length && tdsModels.series.length === 1;
    const userConfirmed = Boolean(plan.confirmedSeries &&
      detectScheduleSeries(plan.confirmedSeries, catalogue, modelCatalog).series.length);
    const seriesConflicts = scheduleModels.series.length && tdsModels.series.length &&
      tdsModels.series.some((name) => !scheduleModels.series.some((other) => other.toUpperCase() === name.toUpperCase()))
      ? [`Schedule: ${scheduleModels.series.join(", ")}; TDS: ${tdsModels.series.join(", ")}`] : [];
    const availableDocs = docsForSelection(companies.find((item) => item.id === record.companyId),
      brands.find((item) => item.id === record.brandId), record.seriesIds);
    const excludedCertificates = [...new Set(availableDocs.filter((doc) =>
      /(?:test|performance|product).*?(?:report|certificat)/i.test(`${doc.category ?? ""} ${doc.name}`) &&
      /(?:certificat|report)/i.test(doc.name) &&
      !verifiedAiLibraryDoc(doc, brands.find((item) => item.id === record.brandId), record.seriesIds, detectedModels.series)
    ).map((doc) => doc.name))];
    return {
      sections: [...new Set([...record.sections.map((section) => section.title), ...assignments.filter(Boolean)])],
      indexMode: record.indexMode,
      sectionStatus: record.sections.map((section) => ({
        title: section.title,
        count: section.docs.length + assignments.filter((title) => title === section.title).length,
      })),
      assignments,
      missingCover,
      missingDocuments: omitEmpty ? [] : empty.map((section) => section.title),
      unassignedFiles: uploads.filter((_, index) => !assignments[index]).map((upload) => upload.file.name),
      attachedCount: record.sections.reduce((sum, section) => sum + section.docs.length, 0) + assignments.filter(Boolean).length,
      omittedCount: omitEmpty ? empty.length : 0,
      emptyCount: empty.length,
      detectedSeries: detectedModels.series,
      unresolvedModels: userConfirmed ? [] : detectedModels.unresolved,
      unreadableSchedules: scheduleUploads.filter((upload) => !(upload.scheduleText ?? upload.documentText ?? "").trim()).map((upload) => upload.file.name),
      undetectedSchedules: scheduleUploads.filter((upload) => { const text = upload.scheduleText ?? upload.documentText ?? ""; return Boolean(text.trim()) && !detectScheduleSeries(text, catalogue, modelCatalog).series.length && !tdsFallback && !userConfirmed; }).map((upload) => upload.file.name),
      seriesConflicts,
      excludedCertificates,
      unverifiedCertificates: record.sections
        .filter((section) => /\b(?:test|performance|product)\b.*\b(?:report|certificat)/i.test(section.title))
        .flatMap((section) => section.docs.filter((doc) => doc.auto).map((doc) => doc.name))
        .filter((name) => {
          const selected = detectedModels.series;
          const model = selected.length ? selected : [plan.product].filter(Boolean);
          const compact = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
          return model.some((series) => !compact.includes(series.toUpperCase().replace(/[^A-Z0-9]/g, "")));
        }),
    };
  };
  const applyChatPlan = async (plan: SubmittalChatPlan, uploads: ChatUpload[], omitEmpty: boolean, destination: "pdf" | "builder", confirmedCertificateMapping: boolean): Promise<string> => {
    const review = inspectChatPlan(plan, uploads, omitEmpty);
    if (destination === "pdf") {
      // Missing client fields and empty/missing index sections are warnings only.
      // Build with whatever the client supplied; keep empty dividers in the PDF.
      if (review.unassignedFiles.length) throw new Error(`Choose a divider for: ${review.unassignedFiles.join(", ")}.`);
    }
    if (destination === "pdf") setLastChatPdfReadyId(undefined);
    const record = prepareChatRecord(plan, uploads);
    const sourceCover = uploads.find((upload) => upload.kind === "cover");
    const sourceIndex = plan.indexMode === "customer" || plan.indexMode === "keep" ? uploads.find((upload) => upload.kind === "index") : undefined;
    const saveSourceArtwork = async (upload: ChatUpload | undefined, kind: "cover" | "index") => {
      if (!upload) return undefined;
      const file = (await normalizeUploads([upload.file]))[0]!;
      const id = uid();
      setUploadProgress(0);
      try {
        await uploadSubmittalFile(`doc:${id}`, file, setUploadProgress);
      } finally { setUploadProgress(null); }
      if (file.size <= 1024 * 1024) mem.current.set(id, await file.arrayBuffer());
      const ref: DocRef = { id, name: file.name, type: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : ""), size: file.size, pages: await countPdfPages(file) };
      if (kind === "cover") {
        record.coverDoc = ref;
        record.coverText = upload.documentText ?? upload.scheduleText ?? record.coverText;
      } else {
        record.indexDoc = ref;
        record.indexText = upload.documentText ?? upload.scheduleText ?? record.indexText;
        record.indexMode = "customer";
      }
      return ref;
    };
    await saveSourceArtwork(sourceCover, "cover");
    await saveSourceArtwork(sourceIndex, "index");
    if (omitEmpty) record.sections = record.sections.filter((section) => section.docs.length || review.assignments.includes(section.title));
    for (const [i, upload] of uploads.entries()) {
      if (upload.kind === "cover" || upload.kind === "index") continue;
      const title = review.assignments[i] || (destination === "builder" ? upload.file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 100) : "");
      let target = record.sections.find((section) => section.title === title);
      if (!target && title) { target = { id: uid(), title, docs: [] }; record.sections.push(target); }
      if (!target) throw new Error(`Choose a divider for ${upload.file.name}.`);
      const file = (await normalizeUploads([upload.file]))[0]!;
      const id = uid();
      setUploadProgress(0);
      try {
        await uploadSubmittalFile(`doc:${id}`, file, setUploadProgress);
      } finally { setUploadProgress(null); }
      if (file.size <= 1024 * 1024) mem.current.set(id, await file.arrayBuffer());
      target.docs.push({ id, name: file.name, type: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : ""), size: file.size, pages: await countPdfPages(file) });
    }
    setPdf(undefined); setHasPdfIssues(false);
    setRecords((items) => [record, ...items]);
    // Use the exact core-builder state immediately so PDF assembly can start
    // without waiting on the cloud metadata write.
    await loadRecord(record);
    if (destination === "pdf") {
      void putCloudRecord(tenantId, record).catch((error) => {
        setNotice(`Cloud save failed: ${error instanceof Error ? error.message : "Please retry save."}`);
      });
      // Use the same automatic core-builder flow on desktop and mobile.
      // The manual download button remains available as a fallback if the browser
      // suppresses a programmatic download.
      setPreparedChatPdfId(undefined);
      setPendingChatDownloadId(record.id);
      setLastChatPdfReadyId(undefined);
      setNotice(`${record.ref} Rev ${record.rev} · Building combined PDF…`);
      return `${record.ref} Rev ${record.rev} · Core builder is assembling and will download the combined PDF automatically.`;
    }
    await putCloudRecord(tenantId, record);
    setPendingChatDownloadId(undefined);
    setNotice(`${record.ref} Rev ${record.rev} opened in the builder. Edit the cover, index and documents, then download the PDF.`);
    return `${record.ref} Rev ${record.rev} saved and opened in the full builder.`;
  };
  useEffect(() => {
    if (!pendingChatDownloadId || editingId !== pendingChatDownloadId) return;
    if (largeMode && manualBuildKey !== buildKey) { setManualBuildKey(buildKey); return; }
    if (building) return;
    if (pdf && !hasPdfIssues) {
      setLastChatPdfReadyId(pendingChatDownloadId);
      setPreparedChatPdfId(undefined);
      setPendingChatDownloadId(undefined);
      void download();
    } else if (hasPdfIssues) {
      setPendingChatDownloadId(undefined);
      setNotice("Some files could not be included. Review the builder notice, correct them and download the PDF.");
    }
  }, [pendingChatDownloadId, editingId, largeMode, manualBuildKey, buildKey, building, pdf, hasPdfIssues]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMgr = (tab: "companies" | "brands") => { setMgrTab(tab); setMgrOpen(true); };
  const totalDocs = sections.filter((section) => !section.auto).reduce((n, s) => n + s.docs.length, 0);
  const pickSection = sections.find((s) => s.id === pickFor);
  const selectCls = "h-11 w-full rounded-xl border-0 bg-background/70 px-3 text-sm font-bold";

  const saveStandardIndex = async (key: "general" | "project", source: string, useNow = false) => {
    const titles = localParse("", source).sections;
    if (!titles.length) { setNotice("Add at least one index heading on a separate line before saving."); return; }
    const previous = indexTemplates;
    const updated = { ...previous, [key]: titles };
    setSavingTemplate(key);
    setIndexTemplates(updated);
    try {
      await putCloudSettings(tenantId, { companies, brands, indexTemplates: updated, selection: { companyId, brandId, seriesIds, customProducts, stampAll } });
      setTemplateDrafts((current) => ({ ...current, [key]: titles.join("\n") }));
      if (useNow) { setIndexMode(key); setUseDefaultIndex(false); appliedCustomerIndexText.current = ""; }
      if (indexMode === key || useNow) setSections((current) => attach(mkSections(titles, current), pool));
      setNotice(`${key === "general" ? "General" : "Project"} index saved: ${titles.length} headings.${useNow ? " It is now in use for this submittal." : " This template is ready for new submittals."}`);
    } catch (error) {
      setIndexTemplates(previous);
      setNotice(`Template save failed: ${error instanceof Error ? error.message : "Please retry."}`);
    } finally { setSavingTemplate(null); }
  };

  const pasteBox = (which: "cover" | "index", label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <div className="rounded-xl border border-transparent transition-colors hover:border-primary/20"
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(event) => { const file = event.dataTransfer.files[0]; if (!file) return; event.preventDefault(); void readFile(which, file); }}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${which}-paste`} className="text-[11px] font-bold uppercase text-muted-foreground">{label}</label>
        <label className="flex cursor-pointer items-center gap-1 shrink-0 whitespace-nowrap rounded-full bg-grad-teal px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-clay-sm transition hover:-translate-y-0.5">
          {reading === which ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />} Upload file
          <input type="file" accept=".pdf,.txt,text/plain" className="hidden" aria-label={`Upload ${which} file`} onChange={(e) => { void readFile(which, e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <Textarea id={`${which}-paste`} value={value} onChange={(e) => { const content = e.target.value; set(content); if (which === "cover") { const parsed = localParse(content, ""); if (parsed.fields.length) setFields((previous) => mergeCoverFields(previous, parsed.fields, true)); } if (which === "index" && content.trim()) { setIndexMode("customer"); setUseDefaultIndex(false); } }} placeholder={placeholder} className="mt-1.5 min-h-28 rounded-2xl border-0 bg-background/70 px-4 py-3 text-sm font-semibold shadow-none" />
    </div>
  );

  return (
    <MainLayout><div className="submittal-lite min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-7xl pb-28 lg:pb-8">
        <header className="flex items-center gap-3 px-5 pb-4 pt-5 lg:px-8">
          {company?.logo ? <img src={company.logo} alt="Company logo" className="size-12 rounded-2xl bg-card object-contain p-1 shadow-clay-sm" /> : <button type="button" onClick={() => openMgr("companies")} className="grid size-12 place-items-center rounded-2xl border-2 border-dashed border-primary text-primary" aria-label="Add your company logo"><ImagePlus className="size-5" /></button>}
          <div className="min-w-0 leading-tight"><h1 className="truncate font-display text-[19px] font-semibold">{company?.name.trim() || "Submittal Control"}</h1><p className="truncate text-xs font-semibold text-muted-foreground">Submittal register & builder</p></div>
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}><LayoutGrid /> Submittals</Button>
            <Button variant={view === "edit" && !editingId ? "default" : "outline"} size="sm" onClick={resetEditor}><FilePlus2 /> New</Button>
            <Button variant="outline" size="sm" onClick={() => openMgr("brands")}><Tag /> Brands</Button>
          </div>
          <Button variant="outline" size="sm" className="ml-auto lg:ml-0" onClick={() => setChatOpen(true)}><Sparkles /> Create by chat</Button>
          <Button variant="outline" size="icon" className="size-10 rounded-full" onClick={() => openMgr("companies")} aria-label="Companies and brands"><Settings2 /></Button>
        </header>

        {notice && <div role="status" className="mx-5 mb-4 flex items-center justify-between rounded-2xl bg-accent/45 px-4 py-3 text-sm font-bold lg:mx-8"><span>{notice}</span><Button variant="ghost" size="icon" onClick={() => setNotice("")} aria-label="Dismiss message"><X /></Button></div>}

        {view === "edit" ? (
          <main className="grid gap-5 px-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)] lg:px-8">
            <div className="flex items-center gap-3 rounded-3xl bg-grad-primary p-4 text-primary-foreground shadow-clay lg:col-span-2">
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => setView("list")} aria-label="Back to submittals"><ArrowLeft /></Button>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold text-primary-foreground/85">{editing ? `${editing.ref}${editing.rev ? ` · Rev ${editing.rev}` : ""}` : `${nextRef(kind, records)} · new`}</p>
                <p className="truncate font-display text-lg font-semibold">{title || "Untitled submittal"}</p>
              </div>
              {editing && <span className="hidden items-center gap-1.5 rounded-full bg-background/95 px-3 py-1 text-[10px] font-extrabold text-foreground shadow-clay-sm ring-1 ring-primary/30 sm:inline-flex"><span className={`size-1.5 rounded-full ${statusDot(editing.status)}`} aria-hidden />{editing.status}</span>}
              <Button variant="outline" size="sm" className="bg-white text-primary hover:bg-white/90 hover:text-primary" onClick={() => void save()}><Save /> Save</Button>
            </div>
            <div className="space-y-5">
              <div className="grid gap-3 rounded-2xl bg-card p-4 shadow-clay-sm sm:grid-cols-2">
                <label className="text-xs font-bold">Submittal title
                  <Input aria-label="Submittal title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. KINAIR KVF-P Fan" className="mt-1" />
                </label>
                <label className="text-xs font-bold">PDF cover heading
                  <Input aria-label="PDF cover heading" value={coverHeading} onChange={(event) => setCoverHeading(event.target.value)} placeholder={kind === "Material" && selectedProducts ? `Material Submittal for ${selectedProducts}` : kindLabel[kind]} className="mt-1" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-card/70 p-1.5 shadow-clay-sm">
                {(["Material", "PQ", "O&M"] as Kind[]).map((k) => <Button key={k} variant={k === kind ? "default" : "ghost"} className="h-12 rounded-xl text-xs font-bold" onClick={() => { setKind(k); if (indexMode !== "customer" && !indexText.trim()) setSections(attach(mkSections(k === "Material" ? indexTemplates[indexMode === "project" ? "project" : "general"] : sectionDefaults[k]), pool)); }}>{k}</Button>)}
              </div>

              <section className="space-y-3 rounded-3xl bg-card/90 p-4 shadow-clay ring-1 ring-border/60 backdrop-blur">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-grad">1 · Choose supplier, brand & product</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-[10px] font-extrabold uppercase text-muted-foreground"><span>Supplier company</span><span className="flex gap-1.5"><Building2 className="mt-3 size-4 shrink-0 text-primary" /><select aria-label="Supplier company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={selectCls}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name || "Unnamed company"}</option>)}</select></span></label>
                  <label className="space-y-1 text-[10px] font-extrabold uppercase text-muted-foreground"><span>Brand / manufacturer</span><span className="flex gap-1.5"><Tag className="mt-3 size-4 shrink-0 text-primary" /><select aria-label="Brand or manufacturer" value={brandId} onChange={(e) => { setBrandId(e.target.value); setSeriesIds([]); }} className={selectCls}><option value="">Choose brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name || "Unnamed brand"}</option>)}</select></span></label>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-extrabold uppercase text-muted-foreground">Product / equipment — choose one or more</p>
                  <div className="flex flex-wrap gap-1.5">{defaultProductOptions.map((s) => { const on = seriesIds.includes(s.id); return <Button key={s.id} type="button" variant={on ? "default" : "outline"} size="sm" aria-pressed={on} onClick={() => setSeriesIds((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}>{on && <Check className="size-3" />}{s.name}</Button>; })}</div>
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Input value={customProduct} onChange={(e) => setCustomProduct(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomProduct(); } }} maxLength={80} placeholder="Type custom product or equipment" aria-label="Custom product or equipment" className="h-10 min-w-0 rounded-xl bg-background/70 text-xs font-semibold" />
                    <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={addCustomProduct} disabled={!customProduct.trim()}><Plus /> Add custom</Button>
                  </div>
                  {customProductOptions.length > 0 && <>
                    <p className="mb-1.5 mt-3 text-[10px] font-extrabold uppercase text-muted-foreground">Your custom products</p>
                    <div className="flex flex-wrap gap-1.5">{customProductOptions.map((s) => { const on = seriesIds.includes(s.id); return <Button key={s.id} type="button" variant={on ? "default" : "outline"} size="sm" aria-pressed={on} onClick={() => setSeriesIds((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}>{on && <Check className="size-3" />}{s.name}</Button>; })}</div>
                  </>}
                  {brandSeriesOptions.length > 0 && <>
                    <p className="mb-1.5 mt-3 text-[10px] font-extrabold uppercase text-muted-foreground">{brand?.name || "Brand"} series — only to load saved documents</p>
                    <div className="flex flex-wrap gap-1.5">{brandSeriesOptions.map((s) => { const on = seriesIds.includes(s.id); return <Button key={s.id} type="button" variant={on ? "secondary" : "outline"} size="sm" aria-pressed={on} onClick={() => setSeriesIds((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}>{on && <Check className="size-3" />}{s.name}</Button>; })}</div>
                  </>}
                </div>
                {kind === "Material" && <div className="rounded-2xl bg-primary/10 px-3 py-2 text-sm font-extrabold text-primary">Material Submittal{selectedProducts ? ` for ${selectedProducts}` : " — choose product"}</div>}
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground"><span>{new Set(sections.flatMap((section) => section.docs.filter((doc) => doc.auto).map((doc) => doc.id))).size} of {pool.length} saved documents matched to index</span><Button variant="ghost" size="sm" onClick={() => openMgr("companies")}>Manage</Button></div>
                <div className="space-y-2 rounded-2xl bg-background/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold">Company stamp</p>
                    <button type="button" onClick={() => { setStampAll(false); setStampCover(true); setStampIndex(true); setSections((ss) => ss.map((section) => ({ ...section, stamp: defaultSectionStamp(section.title) }))); }} className="rounded-full bg-card px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/10">Use requested defaults</button>
                    <div className="flex gap-1"><button type="button" onClick={() => { setStampAll(true); setStampCover(true); setStampIndex(true); setSections((ss) => ss.map((x) => ({ ...x, stamp: "all" }))); }} className="rounded-full bg-grad-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground shadow-glow">Stamp all</button><button type="button" onClick={() => { setStampAll(false); setStampCover(false); setStampIndex(false); setSections((ss) => ss.map((x) => ({ ...x, stamp: "none" }))); }} className="rounded-full bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">No stamp</button></div></div>
                  <div className="flex items-center justify-between"><label htmlFor="stamp-cover" className="text-[11px] font-semibold">Cover page</label><Switch id="stamp-cover" checked={stampCover} onCheckedChange={setStampCover} /></div>
                  <div className="flex items-center justify-between"><label htmlFor="stamp-index" className="text-[11px] font-semibold">Index page</label><Switch id="stamp-index" checked={stampIndex} onCheckedChange={setStampIndex} /></div>
                  <div className="flex items-center justify-between"><label htmlFor="stamp-dividers" className="text-[11px] font-semibold">All divider pages</label><Switch id="stamp-dividers" checked={sections.length > 0 && sections.every((section) => (section.stamp ?? (stampAll ? "all" : "divider")) !== "none")} onCheckedChange={(checked) => setSections((ss) => ss.map((section) => ({ ...section, stamp: checked ? defaultSectionStamp(section.title) : "none" })))} /></div>
                  <div className="flex items-center justify-between"><label htmlFor="stamp-schedule" className="text-[11px] font-semibold">Material Schedule · divider + document pages</label><Switch id="stamp-schedule" disabled={!sections.some((section) => isMaterialSchedule(section.title))} checked={sections.some((section) => isMaterialSchedule(section.title) && (section.stamp ?? (stampAll ? "all" : "divider")) === "all")} onCheckedChange={(checked) => setSections((ss) => ss.map((section) => isMaterialSchedule(section.title) ? { ...section, stamp: checked ? "all" : section.stamp === "none" ? "none" : "divider" } : section))} /></div>
                  <div className="flex items-center justify-between"><label htmlFor="stamp-compliance" className="text-[11px] font-semibold">Compliance Statement · divider + document pages</label><Switch id="stamp-compliance" disabled={!sections.some((section) => isComplianceStatement(section.title))} checked={sections.some((section) => isComplianceStatement(section.title) && (section.stamp ?? (stampAll ? "all" : "divider")) === "all")} onCheckedChange={(checked) => setSections((ss) => ss.map((section) => isComplianceStatement(section.title) ? { ...section, stamp: checked ? "all" : section.stamp === "none" ? "none" : "divider" } : section))} /></div>
                  <p className="text-[10px] font-semibold text-muted-foreground">Toggle each page group here. Individual divider Stamp buttons can override a section.</p>
                </div>
              </section>

              <section className="space-y-3 rounded-3xl bg-card/90 p-4 shadow-clay ring-1 ring-border/60 backdrop-blur">
                {pasteBox("cover", "2 · Cover page details — paste or upload", coverText, setCoverText, "Project Name: Marina Towers\nClient Name: ...\nMEP Consultant: ...\nMain Contractor: ...\nMEP Contractor: ...\nSupplier Name: ...\nBrand Name: ...\nSubmittal Title: Air handling units")}
                <div className="rounded-2xl bg-background/70 p-3">
                  <p className="text-xs font-bold">3 · Index source</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">General Specification is ready by default. Choose Project Specification + Compliance, or paste/upload a customer's index below.</p>
                  <p className="mt-2 text-xs font-semibold text-primary">Using now: {indexMode === "general" ? "General Specification" : indexMode === "project" ? "Project Specification + Compliance" : "Customer index"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {([["general", "General Specification"], ["project", "Project Specification + Compliance"], ["customer", "Customer index"]] as const).map(([mode, label]) => (
                      <Button key={mode} type="button" size="sm" variant={indexMode === mode ? "default" : "outline"} aria-pressed={indexMode === mode} onClick={() => {
                        setIndexMode(mode);
                        if (mode !== "customer") {
                          appliedCustomerIndexText.current = "";
                          setUseDefaultIndex(false);
                          setSections((previous) => attach(mkSections(mode === "general" ? (kind === "Material" ? indexTemplates.general : sectionDefaults[kind]) : indexTemplates.project, previous), pool));
                        }
                      }}>{label}</Button>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {(["general", "project"] as const).map((key) => <div key={key} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold">{key === "general" ? "General Specification" : "Project Specification + Compliance"}</p>
                        <span className="text-[11px] text-muted-foreground">{indexTemplates[key].length} saved headings</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">One heading per line. Edit here, then save to use this standard later.</p>
                      <Textarea aria-label={`Edit ${key} index`} value={templateDrafts[key]} onChange={(event) => setTemplateDrafts((drafts) => ({ ...drafts, [key]: event.target.value }))} className="mt-2 min-h-40 bg-background text-xs" />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" disabled={savingTemplate !== null || !templateDrafts[key].trim()} onClick={() => void saveStandardIndex(key, templateDrafts[key])}>
                          {savingTemplate === key ? <Loader2 className="animate-spin" /> : <Save />} {savingTemplate === key ? "Saving…" : `Save ${key === "general" ? "General" : "Project"} index`}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setIndexMode(key);
                          setSections((current) => attach(mkSections(indexTemplates[key], current), pool));
                        }}>Use saved index</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setTemplateDrafts((drafts) => ({ ...drafts, [key]: sections.filter((section) => !section.auto).map((section) => section.title).join("\n") }))}>Copy current dividers</Button>
                      </div>
                    </div>)}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">The two standard indexes are saved separately. Customer index pasted below applies to this submittal until you save it to a standard.</p>
                </div>
                {pasteBox("index", "Customer index — optional paste or upload", indexText, setIndexText, "1. Technical data sheet\n2. Test certificates\n3. Catalogue\n4. Previous approval")}
                {indexMode === "customer" && indexText.trim() && <div className="flex flex-wrap gap-2">
                  {(["general", "project"] as const).map((key) => <Button key={key} type="button" variant="secondary" size="sm" disabled={savingTemplate !== null} onClick={() => {
                    const source = appliedCustomerIndexText.current === indexText
                      ? sections.filter((section) => !section.auto).map((section) => section.title).join("\n")
                      : indexText;
                    void saveStandardIndex(key, source, true);
                  }}><Save /> {savingTemplate === key ? `Saving ${key}…` : `Save customer index as ${key === "general" ? "General" : "Project"}`}</Button>)}
                </div>}
                <p className="text-[10px] font-semibold text-muted-foreground">Upload searchable PDF or TXT. Save Word as PDF first; paste text from scanned files.</p>
                <Button variant="default" size="lg" className="w-full" onClick={read} disabled={!!reading}>{reading === "build" ? <Loader2 className="animate-spin" /> : <Wand2 />} {reading === "build" ? "Reading…" : "Build cover, index & dividers"}</Button>
              </section>

              {fields.length > 0 && (
                <section className="rounded-3xl bg-card/90 p-4 shadow-clay ring-1 ring-border/60 backdrop-blur">
                  <p className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Cover fields — type directly or paste/upload above</p>
                  <div className="space-y-2">{fields.map((f, i) => <div key={i} className="grid grid-cols-[auto_0.8fr_1.4fr_auto] items-center gap-2" onDragOver={(event) => { if (dragged.current?.kind === "field") { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { if (dragged.current?.kind !== "field") return; event.preventDefault(); onDropItem(dragged.current, { kind: "field", index: i }); dragged.current = null; }}><span draggable aria-label={`Drag cover field ${f.label || i + 1}`} title="Drag to reorder cover fields" className="cursor-grab touch-none text-primary active:cursor-grabbing" onDragStart={(event) => onBeginDrag(event, { kind: "field", index: i })} onDragEnd={() => { dragged.current = null; }}><GripVertical className="size-4" /></span><Input value={f.label} onChange={(e) => setFields((fs) => fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-10 rounded-xl bg-background/70 text-xs font-bold" /><Input value={f.value} placeholder={/supplier/i.test(f.label) ? company?.name || "Supplier" : /brand/i.test(f.label) ? brand?.name || "Brand" : "Type here"} aria-label={`${f.label} value`} onChange={(e) => setFields((fs) => fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-10 rounded-xl bg-background/70 text-xs" /><Button variant="ghost" size="icon" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} aria-label="Remove field"><X /></Button></div>)}</div>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFields((fs) => [...fs, { label: "", value: "" }])}><Plus /> Add field</Button>
                </section>
              )}

              <section className="rounded-3xl bg-card/90 p-4 shadow-clay ring-1 ring-border/60 backdrop-blur">
                <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[11px] font-extrabold uppercase tracking-wider text-grad">4 · Dividers & documents</p><p className="text-xs font-semibold text-muted-foreground">{sections.filter((section) => !section.auto).length} index dividers{sections.some((section) => section.auto) ? ` · ${sections.filter((section) => section.auto).length} previous upload groups to reassign (excluded from PDF)` : ""} · {totalDocs} documents · drag handles to reorder · drop PDF files onto a divider</p></div><Button variant="outline" size="sm" onClick={() => { setSections((s) => attach(s, pool)); setNotice(pool.length ? "Saved documents re-matched to dividers." : "No saved documents for this company / brand yet."); }}><Sparkles /> Re-match</Button></div>
                <input ref={barFileRef} type="file" disabled={uploadProgress !== null} multiple accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => { void addFilesToBar(barTarget.current, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                    <ol className="space-y-2">
                      {sections.map((s, i) => (
                        <Bar key={s.id} s={s} i={i}
                          onBeginDrag={onBeginDrag} onDropItem={onDropItem} dragged={dragged}
                          stampMode={s.stamp ?? (stampAll ? "all" : "divider")}
                          onStamp={(m) => setSections((ss) => ss.map((x) => (x.id === s.id ? { ...x, stamp: m } : x)))}
                          onRename={(t) => setSections((ss) => ss.map((x) => (x.id === s.id ? { ...x, title: t } : x)))}
                          onRemove={() => setSections((ss) => ss.filter((x) => x.id !== s.id))}
                          onInsert={() => insertBar(i + 1)}
                          onMove={(d) => moveBar(i, d)}
                          onDefault={() => setPickFor(s.id)}
                          onUpload={() => { if (uploadProgress !== null) return; barTarget.current = s.id; barFileRef.current?.click(); }}
                          onDocMove={(j, d) => moveDoc(s.id, j, d)}
                          onFilesDrop={(files) => addFilesToBar(s.id, files)}
                          onDocRemove={(j) => setSections((ss) => ss.map((x) => (x.id === s.id ? { ...x, docs: x.docs.filter((_, k) => k !== j) } : x)))} />
                      ))}
                    </ol>
                  
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => insertBar(sections.length)}><Plus /> Add divider</Button>
              </section>
            </div>

            <div className="lg:sticky lg:top-4 lg:self-start">
              {largeMode && <div className="mb-3 rounded-xl bg-secondary p-3 text-sm"><p className="font-bold">{mobileMode ? "Mobile lightweight mode" : `Large submittal · ${pageTotal} source pages`}</p><p className="mt-1 text-xs">{mobileMode ? "Preview is deferred to keep the phone responsive. Build the PDF only when you need it." : "The PDF builds when requested so editing and upload stay responsive."}</p><Button className="mt-2" disabled={building || uploadProgress !== null} onClick={() => setManualBuildKey(buildKey)}>{building ? "Building…" : "Build PDF preview"}</Button></div>}
              {uploadProgress !== null && <p role="status" className="mb-3 text-sm">Uploading document: {uploadProgress}%</p>}
              <PdfPreview bytes={pdf?.bytes} labels={pdf?.labels ?? []} building={building} rotations={rotations} onRotate={(i, d) => setRotations((r) => ({ ...r, [i]: ((r[i] ?? 0) + d + 360) % 360 }))} />
              <div className="mt-4 grid grid-cols-2 gap-3"><Button variant="default" size="default" onClick={() => void download()} disabled={!pdf || building || hasPdfIssues}><Download /> Download PDF</Button><Button variant="outline" size="default" onClick={() => void save("Submitted")} disabled={!pdf || building || hasPdfIssues}><Check /> Mark submitted</Button></div>
              <Button variant="ghost" className="mt-2 w-full" onClick={() => save()}><Save /> {editing ? "Save changes" : "Save as draft"}</Button>
            </div>
          </main>
        ) : (
          <SubmittalsHome onShare={shareSavedRecord} records={records} companies={companies} brands={brands} onNew={resetEditor} onEdit={(r) => void loadRecord(r)} onDuplicate={(r) => void loadRecord(r, true)} onDelete={(id) => void deleteRecord(id)} onStatus={(id, status, note) => void setRecordStatus(id, status, note)} />
        )}

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-5 py-2 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
            <Button variant="ghost" className={`h-14 flex-col gap-0.5 rounded-xl text-[10px] font-bold ${view === "list" ? "bg-secondary text-primary" : "text-muted-foreground"}`} onClick={() => setView("list")}><LayoutGrid className="size-5" />Submittals</Button>
            <Button variant="default" className="h-14 flex-col gap-0.5 rounded-xl text-[10px] font-bold" onClick={resetEditor}><FilePlus2 className="size-5" />New</Button>
            <Button variant="ghost" className="h-14 flex-col gap-0.5 rounded-xl text-[10px] font-bold text-muted-foreground" onClick={() => openMgr("brands")}><Library className="size-5" />Library</Button>
          </div>
        </nav>
      </div>

      {!chatOpen && <button
        type="button"
        aria-label="Open KINAIR submittal AI chat"
        onClick={() => setChatOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-primary/20 bg-card px-4 py-3 text-left shadow-xl transition hover:-translate-y-0.5 hover:border-primary lg:bottom-6 lg:right-6"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">Ask KINAIR Submittal AI</span>
          <span className="block truncate text-[11px] text-muted-foreground">Standard index · Missing files · Final PDF</span>
        </span>
      </button>}
      {chatMounted && <SubmittalChat open={chatOpen} onOpenChange={setChatOpen} records={records} brands={brands.map((brand) => brand.name)} seriesCatalogue={brands.flatMap((brand) => brand.series.map((series) => series.name))} modelCatalog={modelCatalog} tenantId={tenantId} currentRecordId={view === "edit" ? editingId : undefined} inspectPlan={inspectChatPlan} onApply={applyChatPlan} pdfBuilding={Boolean(pendingChatDownloadId)} pdfReady={Boolean(lastChatPdfReadyId && editingId === lastChatPdfReadyId && pdf && !building && !hasPdfIssues)} pdfPrepared={Boolean(preparedChatPdfId && editingId === preparedChatPdfId)} pdfFailed={Boolean(pendingChatDownloadId && hasPdfIssues && !building)} mobileMode={mobileMode} scheduleBranding={{ companyName: company?.name, companyLogo: company?.logo, brandLogo: brand?.logo }} onSharePdf={async () => {
        if (!pdf || building || hasPdfIssues || !lastChatPdfReadyId || editingId !== lastChatPdfReadyId) throw new Error("Build the final submittal PDF before sharing.");
        return shareSubmittalPdf(tenantId, pdf.bytes);
      }} onDownloadPdf={() => {
        if (preparedChatPdfId && editingId === preparedChatPdfId && (!pdf || largeMode)) {
          setPreparedChatPdfId(undefined);
          setPendingChatDownloadId(preparedChatPdfId);
          setManualBuildKey(buildKey);
          return;
        }
        void download();
      }} onOpenBuilder={() => { resetEditor(); setChatOpen(false); }} />}
      <LibraryManager open={mgrOpen} onClose={() => setMgrOpen(false)} tab={mgrTab} setTab={setMgrTab} companies={companies} setCompanies={(fn) => setCompanies((c) => { const n = fn(c); if (!n.some((x) => x.id === companyId)) setCompanyId(n[0]?.id ?? ""); return n; })} brands={brands} setBrands={setBrands} />
      <DocPicker open={!!pickFor} onClose={() => setPickFor(undefined)} title={pickSection?.title ?? ""}
        groups={[
          { label: "Selected company, brand & series", docs: pool },
          ...companies.filter((c) => c.id !== companyId).map((c) => ({ label: c.name || "Company", docs: c.docs })),
          ...brands.flatMap((b) => [{ label: b.name || "Brand", docs: b.id === brandId ? [] : b.docs }, ...b.series.filter((s) => !seriesIds.includes(s.id)).map((s) => ({ label: `${b.name} · ${s.name}`, docs: s.docs }))]),
        ]}
        onPick={(d) => { if (pickFor) addDocToBar(pickFor, d); }} />
    </div></MainLayout>
  );
}

export default function SubmittalControlPage() {
  const { user, isLoading, tenantId } = useAuth();
  setSubmittalStorageTenantId(tenantId);
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!tenantId) return <MainLayout><p className="p-6">Your workspace could not be loaded. Please sign in again.</p></MainLayout>;
  return <SimpleSubmittalBuilder tenantId={tenantId} />;
}

