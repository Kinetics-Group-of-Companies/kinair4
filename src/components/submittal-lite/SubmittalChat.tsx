import { useEffect, useRef, useState } from "react";
import { getDynamicModelOptions, fallbackAiModelOptions, type RegisteredAiModel, type AiMode } from "@/lib/ai/model-options";
import { FileUp, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/backend/client";
import { extractText, readScannedPage } from "@/lib/submittal-lite/extract";
import { detectScheduleSeries, isSelectorSeries, normalizeOcrModelCodes, seriesProductType, type SeriesModel } from "@/lib/submittal-lite/schedule-series";
import { makeAssistantSubmittalTds } from "@/lib/submittal-lite/selector-tds";
import { probeSelectionAssistantSchedule, readSelectionAssistantSchedule } from "@/lib/submittal-lite/selection-assistant-schedule";
import type { AssistantScheduleItem } from "@/lib/submittal-lite/selector-tds";
import { useSupabaseFanDatabase } from "@/hooks/useSupabaseFanDatabase";
import { useAllFanDimensions, useTenantData } from "@/hooks/useFanDatabase";
import { useAirCurtainModels, useAirCurtainBrands, useAirCurtainSeries, useAirCurtainDimensions } from "@/hooks/useAirCurtains";
import { loadSelectorModelCatalogue } from "@/lib/submittal-lite/selector-models";
import type { SubmittalRecord, Kind } from "@/lib/submittal-lite/records";

export type SubmittalChatPlan = {
  action: "create" | "revise" | "clarify"; sourceRecordId: string; kind: Kind;
  title: string; coverHeading?: string; brand: string; product: string; confirmedSeries?: string; indexMode: "general" | "project" | "customer" | "keep";
  fields: { label: string; value: string }[]; sections: string[]; omitSections: string[]; reply: string;
};
type Message = { role: "user" | "assistant"; text: string };
const inferMaterialTypes = (text: string) => {
  const value = text.toUpperCase();
  const found: string[] = [];
  if (/\b(?:FAN|KVF|KTAF|KIN[-\s]?E)\b/.test(value)) found.push("Fan");
  if (/\b(?:AIR\s*CURTAIN|N[-\s]?CROSS\s*FLOW|N[-\s]?CENTRIFUGAL|XD[-\s]?CENTRIFUGAL|WING)\b/.test(value)) found.push("Air Curtains");
  if (/\bFAHU\b|\bFRESH\s*AIR\s*HANDLING\b/.test(value)) found.push("FAHU");
  if (/\bMAHU\b|\bMAKE[-\s]*UP\s*AIR\s*HANDLING\b/.test(value)) found.push("MAHU");
  if (/\bECOLOGY\b|\bECOLOGY\s*UNIT\b|\bKITCHEN\s*EXHAUST\s*ECOLOGY\b/.test(value)) found.push("Ecology");
  if (/\bAHU\b|\bAIR\s*HANDLING\s*UNIT\b/.test(value) && !found.includes("FAHU") && !found.includes("MAHU")) found.push("AHU");
  return [...new Set(found)];
};
export type ChatUpload = { file: File; sectionTitle: string; kind?: "cover" | "index" | "support"; scheduleText?: string; documentText?: string; scheduleError?: string; selectionItems?: AssistantScheduleItem[]; selectionProvider?: string; selectionOptimizeFor?: string };
export type ChatInspection = { sections: string[]; indexMode: "general" | "project" | "customer" | "keep"; sectionStatus: { title: string; count: number }[]; assignments: string[]; missingCover: string[]; missingDocuments: string[]; unassignedFiles: string[]; attachedCount: number; omittedCount: number; emptyCount: number; detectedSeries: string[]; unresolvedModels: string[]; unreadableSchedules: string[]; undetectedSchedules: string[]; seriesConflicts: string[]; unverifiedCertificates: string[]; excludedCertificates: string[] };

function classifyUpload(file: File, text: string): { kind: "cover" | "index" | "support"; sectionTitle: string; isSchedule: boolean } {
  const name = file.name.replace(/[_-]+/g, " ").replace(/\.[^.]+$/, "").toLowerCase();
  const sample = text.slice(0, 8000).toLowerCase();
  const coverFields = ["project name", "client name", "mep consultant", "main contractor", "mep contractor", "supplier name", "brand name", "plot no"].filter((field) => sample.includes(field)).length;
  const indexLines = text.split(/\r?\n/).filter((line) => /^\s*(?:\d{1,2}[.)\-:]\s*|section\s+\d+\s+)/i.test(line)).length;
  const indexHeadings = ["company profile", "material schedule", "technical data sheet", "compliance statement", "test certificate", "warranty", "iso certificate", "project approval"].filter((field) => sample.includes(field)).length;
  if (/\b(?:cover(?: page)?|project details|project information)\b/.test(name) && coverFields >= 2 || coverFields >= 4 && indexLines < 3) return { kind: "cover", sectionTitle: "Cover page", isSchedule: false };
  if (/\b(?:index|table of contents|contents page)\b/.test(name) && indexHeadings >= 2 || (indexLines >= 4 && indexHeadings >= 3 || indexHeadings >= 5 && coverFields < 2)) return { kind: "index", sectionTitle: "Customer index", isSchedule: false };
  const heading = `${name} ${sample.slice(0, 220)}`;
  if (/\b(?:company\s*profile|company\s*statement)\b/.test(heading)) return { kind: "support", sectionTitle: "Company profile", isSchedule: false };
  if (/\b(?:technical\s*data\s*sheet|datasheet|tds|product\s*data\s*sheet)\b/.test(heading)) return { kind: "support", sectionTitle: "Technical data sheet", isSchedule: false };
  const header = `${name} ${sample.slice(0, 1200)}`;
  const match = (pattern: RegExp) => pattern.test(header);
  const scheduleLikeName = /(?:^|\b)schedule(?:\b|\s*\d)|\b(?:fan|air curtain|material|equipment)\b.*\bschedule\b|\bschedule\b.*\b(?:fan|air curtain|material|equipment)\b/.test(name);
  const isSchedule = scheduleLikeName || match(/\b(?:material|equipment|fan|air curtain)\s*(?:selection\s*)?schedule\b/) || /\b(?:airflow|flow rate)\b/.test(sample) && /\b(?:model|qty|quantity)\b/.test(sample) && /\b(?:schedule|tag no|item no)\b/.test(sample);
  if (isSchedule) return { kind: "support", sectionTitle: "Material schedule", isSchedule: true };
  if (match(/\b(?:technical\s*data\s*sheet|datasheet|tds|product\s*data\s*sheet|performance\s*data)\b/)) return { kind: "support", sectionTitle: "Technical data sheet", isSchedule: false };
  if (match(/\bproject\s*specification\b/)) return { kind: "support", sectionTitle: "Project specification", isSchedule: false };
  if (match(/\b(?:compliance|conformity|deviation)\b/)) return { kind: "support", sectionTitle: "Compliance statement", isSchedule: false };
  if (match(/\b(?:test\s*(?:report|certificate)|performance\s*certificate)\b/)) return { kind: "support", sectionTitle: "Test certificate", isSchedule: false };
  if (match(/\b(?:iso\s*(?:9001|14001|45001)|iso\s*certificate)\b/)) return { kind: "support", sectionTitle: "ISO certificate", isSchedule: false };
  if (match(/\b(?:warranty|guarantee)\b/)) return { kind: "support", sectionTitle: "Warranty", isSchedule: false };
  if (match(/\b(?:company\s*profile|company\s*statement)\b/)) return { kind: "support", sectionTitle: "Company profile", isSchedule: false };
  if (match(/\b(?:trade\s*licen[cs]e|trade\s*certificate)\b/)) return { kind: "support", sectionTitle: "Trade certificate", isSchedule: false };
  if (match(/\b(?:previous\s*project\s*approval|approval\s*copy|approved\s*submittal)\b/)) return { kind: "support", sectionTitle: "Previous project approvals", isSchedule: false };
  if (match(/\b(?:product\s*catalogue|catalog|brochure)\b/)) return { kind: "support", sectionTitle: "Product catalogue", isSchedule: false };
  return { kind: "support", sectionTitle: "", isSchedule: false };
}

export function SubmittalChat({ open, onOpenChange, records, brands, seriesCatalogue, modelCatalog, tenantId, currentRecordId, inspectPlan, onApply, onOpenBuilder, pdfBuilding, pdfReady, pdfFailed, onDownloadPdf }: {
  open: boolean; onOpenChange: (value: boolean) => void; records: SubmittalRecord[];
  brands: string[]; seriesCatalogue: string[]; modelCatalog: SeriesModel[]; tenantId: string; currentRecordId?: string; inspectPlan: (plan: SubmittalChatPlan, uploads: ChatUpload[], omitEmpty: boolean) => ChatInspection;
  onApply: (plan: SubmittalChatPlan, uploads: ChatUpload[], omitEmpty: boolean, destination: "pdf" | "builder", confirmedCertificateMapping: boolean) => Promise<string>;
  onOpenBuilder: () => void;
  pdfBuilding: boolean; pdfReady: boolean; pdfFailed: boolean; onDownloadPdf: () => void;
}) {
  const { database, isLoading: fanLoading } = useSupabaseFanDatabase();
  const { data: dimensionsMap, isLoading: dimensionLoading } = useAllFanDimensions();
  const { data: tenant, isLoading: tenantLoading } = useTenantData();
  const { data: airModels = [], isLoading: airLoading } = useAirCurtainModels();
  const { data: airBrands = [] } = useAirCurtainBrands();
  const { data: airSeries = [] } = useAirCurtainSeries();
  const { data: airDimensions = [] } = useAirCurtainDimensions();
  const selectorLoading = fanLoading || airLoading || dimensionLoading || tenantLoading;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [plan, setPlan] = useState<SubmittalChatPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingUploads, setReadingUploads] = useState(0);
  const [aiMode, setAiMode] = useState<AiMode | "local">("auto");
  const [activeProvider, setActiveProvider] = useState("");
  const [availableModels, setAvailableModels] = useState<RegisteredAiModel[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void supabase.functions.invoke("ai-model-registry").then(({ data, error }) => {
      if (!cancelled && !error && Array.isArray(data?.models)) setAvailableModels(data.models);
    });
    return () => { cancelled = true; };
  }, [open]);
  const dynamicModelOptions = getDynamicModelOptions(availableModels);
  const [applying, setApplying] = useState(false);
  const [uploads, setUploads] = useState<ChatUpload[]>([]);
  const [omitEmpty, setOmitEmpty] = useState(false);
  const [confirmedCertificateMapping, setConfirmedCertificateMapping] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const autoFinish = useRef(true);
  const supportingUploads = uploads.filter((upload) => upload.kind !== "cover" && upload.kind !== "index");
  const review = plan ? inspectPlan(plan, supportingUploads, omitEmpty) : null;
  const plannedSeries = plan ? detectScheduleSeries([plan.product, ...uploads.map((item) => item.scheduleText ?? item.documentText ?? "")].join("\n"), seriesCatalogue, modelCatalog).series : [];
  const plannedTypes = [...new Set([...plannedSeries.map(seriesProductType).filter(Boolean), ...inferMaterialTypes([plan?.product ?? "", ...uploads.map((item) => item.scheduleText ?? item.documentText ?? "")].join("\n"))])];
  const tdsNeeded = Boolean(plan && uploads.some((item) => /schedule/i.test(item.sectionTitle + " " + item.file.name)) && review?.sectionStatus.some((item) => /technical data sheet|datasheet|tds/i.test(item.title) && !item.count));
  const ready = !readingUploads && Boolean(review) && !review?.unassignedFiles.length;
  const ask = async (question = input) => {
    const text = question.trim();
    if (!text || busy || applying) return;
    setInput(""); setBusy(true);
    setMessages((items) => [...items, { role: "user", text }]);
    try {
      const requestUploads = await prepareUploadsForSend();
      const supportingUploadsSnapshot = requestUploads.filter((upload) => upload.kind !== "cover" && upload.kind !== "index");
      const activeCatalog = modelCatalog.length ? modelCatalog : await loadSelectorModelCatalogue(tenantId);
      const recent = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const mentioned = recent.filter((r) => text.toLowerCase().includes(r.ref.toLowerCase()));
      const candidates = [...new Map([...mentioned, ...recent].slice(0, 150).map((r) => [r.id, r])).values()];
      const { data, error } = await supabase.functions.invoke("submittal-assistant", {
        body: { message: text, aiMode, documents: requestUploads.slice(0, 15).map((item) => ({ filename: item.file.name, section: item.sectionTitle, text: (item.scheduleText ?? item.documentText ?? "").slice(0, 6000) })), records: candidates.map((r) => ({ id: r.id, ref: r.ref, rev: r.rev, title: r.title, project: r.project, status: r.status })), brands, catalogueSeries: seriesCatalogue, verifiedSeries: detectScheduleSeries(requestUploads.map((upload) => upload.scheduleText ?? upload.documentText ?? "").join("\n"), seriesCatalogue, activeCatalog).series, scheduleExtracts: requestUploads.filter((upload) => upload.scheduleText).slice(0, 5).map((upload) => ({ filename: upload.file.name, text: upload.scheduleText!.slice(0, 4500) })), currentRecordId, draftPlan: plan, history: messages.slice(-6) },
      });
      if (error) {
        const context = "context" in error ? (error as { context?: Response }).context : undefined;
        const detail = context ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error ?? error.message);
      }
      if (!data?.plan || !["create", "revise", "clarify"].includes(data.plan.action)) throw new Error(data?.error ?? "No plan returned.");
      const nextPlan: SubmittalChatPlan | null = data.plan.action === "clarify" ? plan : { ...data.plan, title: data.plan.title.replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim(), coverHeading: data.plan.coverHeading || plan?.coverHeading || "" };
      setPlan(nextPlan);
      setActiveProvider(data.provider === "local" ? "KINAIR local engine" : data.provider && data.model ? `${data.provider === "openai" ? "OpenAI" : data.provider === "anthropic" ? "Claude" : "Gemini"} · ${availableModels.find((item) => item.model_id === data.model)?.display_name ?? data.model}` : "");
      let effectiveUploads = supportingUploadsSnapshot;
      const scheduleContent = requestUploads.filter((item) => item.sectionTitle === "Material schedule" || /schedule/i.test(item.file.name))
        .map((item) => item.scheduleText ?? item.documentText ?? "").join("\n");
      const detectedScheduleSeries = detectScheduleSeries(scheduleContent, seriesCatalogue, activeCatalog).series;
      const hasSelectorRows = requestUploads.some((item) => item.selectionItems?.length);
      const selectorEligibleSchedule = hasSelectorRows || detectedScheduleSeries.some(isSelectorSeries);
      if (nextPlan && scheduleContent && selectorEligibleSchedule && !supportingUploadsSnapshot.some((item) => /technical data sheet|datasheet|tds/i.test(item.sectionTitle + " " + item.file.name))) {
        const firstCheck = inspectPlan(nextPlan, supportingUploadsSnapshot, omitEmpty);
        const tdsSection = firstCheck.sectionStatus.find((item) => /technical data sheet|datasheet|tds/i.test(item.title));
        if (tdsSection && !tdsSection.count) {
          try {
            const probedItems = requestUploads.flatMap((item) => item.selectionItems ?? []);
            const probedProvider = requestUploads.find((item) => item.selectionItems?.length)?.selectionProvider ?? "";
            const probedOptimize = requestUploads.find((item) => item.selectionItems?.length)?.selectionOptimizeFor;
            const selection = probedItems.length
              ? { items: probedItems, provider: probedProvider, optimizeFor: probedOptimize }
              : await readSelectionAssistantSchedule(scheduleContent, text, aiMode);
            setActiveProvider(selection.provider ? `Selection Assistant · ${selection.provider}` : "KINAIR Selection Assistant");
            const generated = await makeAssistantSubmittalTds(
              selection.items,
              { database, airModels, airBrands, airSeries, airDimensions, dimensionsMap,
                companyName: tenant?.name, logoUrl: tenant?.logo_url },
              (["balanced", "low_noise", "high_efficiency", "low_power", "smallest_size"].includes(selection.optimizeFor ?? "")
                ? selection.optimizeFor : "balanced") as import("@/lib/chatOptimize").FanOptimizeFor);
            if (generated.missing.length) setMessages((items) => [...items, { role: "assistant", text: `Selector TDS could not be generated for: ${generated.missing.join("; ")}. I will continue building the submittal and keep the Technical Data Sheet divider in place.` }]);
            if (generated.file) {
              const sectionTitle = tdsSection.title;
              const newUpload: ChatUpload = { file: generated.file, sectionTitle, kind: "support", documentText: `Selector database technical data: ${generated.models.join(", ")}` };
              effectiveUploads = [...supportingUploadsSnapshot, newUpload];
              setUploads((items) => [...items, newUpload]);
              const uniqueModels = [...new Set(generated.models)];
              setMessages((items) => [...items, { role: "assistant", text: `Selection Assistant read ${selection.items.length} schedule row${selection.items.length === 1 ? "" : "s"} and generated the combined selector datasheet for ${uniqueModels.join(", ")}. Pages 3 onward were inserted under ${sectionTitle}.` }]);
            }
          } catch (tdsError) {
            setMessages((items) => [...items, { role: "assistant", text: `Selector TDS was not generated: ${tdsError instanceof Error ? tdsError.message : "selection data was unavailable"}. I will still build the submittal with the TDS divider retained.` }]);
          }
        }
      }
      const check = nextPlan && inspectPlan(nextPlan, effectiveUploads, omitEmpty);
      const blocking = check ? [...check.unassignedFiles] : [];
      const complete = Boolean(nextPlan && data.plan.action !== "clarify" && check && !blocking.length);
      if (/\b(?:preview only|do not save|don't save|do not download|don't download)\b/i.test(text)) autoFinish.current = false;
      else if (/\b(?:create|build|generate|download|final|finish)\b/i.test(text)) autoFinish.current = true;
      if (autoFinish.current && complete && nextPlan) {
        setMessages((items) => [...items, { role: "assistant", text: "I have the required details and documents. Assembling your combined submittal PDF now…" }]);
        setApplying(true);
        try {
          const sourceUploads = requestUploads.filter((item) => item.kind === "cover" || item.kind === "index");
          const reply = await onApply(nextPlan, [...sourceUploads, ...effectiveUploads], omitEmpty, "pdf", confirmedCertificateMapping);
          setMessages((items) => [...items, { role: "assistant", text: reply }]);
          setPlan(null); setUploads([]); setOmitEmpty(false); setConfirmedCertificateMapping(false); autoFinish.current = true;
        } catch (assembleError) {
          setMessages((items) => [...items, { role: "assistant", text: assembleError instanceof Error ? assembleError.message : String((assembleError as { message?: string })?.message ?? assembleError ?? "Could not assemble the PDF. Please review the files.") }]);
        } finally { setApplying(false); }
      } else {
        const guidance = blocking.length ? `\nPlease choose a divider for: ${[...new Set(blocking)].join(", ")}.` : "";
        setMessages((items) => [...items, { role: "assistant", text: `${data.plan.reply}${guidance}` }]);
      }
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", text: error instanceof Error ? `Could not prepare a draft: ${error.message}` : "Could not prepare a draft. Please try again." }]);
    } finally { setBusy(false); }
  };
  const apply = async (destination: "pdf" | "builder") => {
    if (applying || busy || (destination === "pdf" && (!plan || !ready))) return;
    if (destination === "builder" && !plan && !uploads.length) {
      onOpenBuilder();
      return;
    }
    const draft: SubmittalChatPlan = plan ?? {
      action: "create", sourceRecordId: "", kind: "Material", title: "Material Submittal", coverHeading: "",
      brand: "", product: "", indexMode: "general", fields: [], sections: [], omitSections: [], reply: "",
    };
    setApplying(true);
    try {
      const reply = await onApply(draft, uploads, omitEmpty, destination, confirmedCertificateMapping);
      setMessages((items) => [...items, { role: "assistant", text: reply }]);
      setPlan(null); setUploads([]); setOmitEmpty(false); setConfirmedCertificateMapping(false);
      if (destination === "builder") onOpenChange(false);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", text: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? "Could not save the draft.") }]);
    } finally { setApplying(false); }
  };
  const chooseFiles = () => uploadInputRef.current?.click();
  const prepareUploadsForSend = async (): Promise<ChatUpload[]> => {
    const pending = uploads.filter((item) => !item.scheduleText && !item.documentText && !item.scheduleError);
    if (!pending.length) return uploads;

    setReadingUploads(pending.length);
    try {
      const activeCatalog = modelCatalog.length ? modelCatalog : await loadSelectorModelCatalogue(tenantId);
      const results = await Promise.all(pending.map(async (pendingItem) => {
        const file = pendingItem.file;
        try {
          const extractedRaw = (await extractText(file, readScannedPage)).slice(0, 20000);
          if (!extractedRaw.trim()) throw new Error("No readable text found.");
          const extracted = normalizeOcrModelCodes(extractedRaw, activeCatalog);
          const detected = classifyUpload(file, extracted);
          if (detected.kind === "support" && /\.txt$/i.test(file.name)) throw new Error("Save supporting TXT documents as PDF before building the final submittal.");
          let selectionProbe = null;
          // Content decides whether this is a schedule. Do not trust the local
          // cover/index classifier enough to prevent Selection Assistant review.
          try { selectionProbe = await probeSelectionAssistantSchedule(extracted, aiMode); } catch { selectionProbe = null; }
          const isSchedule = Boolean(selectionProbe?.items.length) || detected.isSchedule;
          return {
            file,
            patch: {
              // A confirmed schedule must always remain a normal supporting document.
              // Otherwise a schedule whose first page looks like a cover can be excluded
              // from divider attachments even though Selection Assistant read it correctly.
              kind: isSchedule ? "support" : detected.kind,
              sectionTitle: isSchedule ? "Material schedule" : detected.sectionTitle,
              ...(isSchedule ? {
                scheduleText: extracted,
                documentText: undefined,
                selectionItems: selectionProbe?.items,
                selectionProvider: selectionProbe?.provider,
                selectionOptimizeFor: selectionProbe?.optimizeFor,
                scheduleError: undefined,
              } : { documentText: extracted, scheduleText: undefined, scheduleError: undefined }),
            } satisfies Partial<ChatUpload>,
          };
        } catch (error) {
          return { file, patch: { scheduleError: error instanceof Error ? error.message : "Could not read this file." } satisfies Partial<ChatUpload> };
        }
      }));
      const prepared = uploads.map((item) => {
        const hit = results.find((result) => result.file === item.file);
        return hit ? { ...item, ...hit.patch } : item;
      });
      setUploads(prepared);
      return prepared;
    } finally {
      setReadingUploads(0);
    }
  };

  const addFiles = (files: File[]) => {
    const supported = files.filter((file) => /\.(pdf|png|jpe?g|txt)$/i.test(file.name) || ["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(file.type));
    if (supported.length !== files.length) setMessages((items) => [...items, { role: "assistant", text: "Upload PDF, PNG, JPG or TXT. Save Word files as PDF first." }]);
    if (!supported.length) return;
    setConfirmedCertificateMapping(false);
    // Attach only. OCR / classification / Selection Assistant starts after the user presses Send.
    setUploads((current) => [...current, ...supported.map((file) => ({ file, sectionTitle: "", kind: "support" as const }))]);
  };
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-xl">
      <SheetHeader className="border-b border-border px-5 py-4"><SheetTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /> KINAIR Submittal AI</SheetTitle></SheetHeader>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {!messages.length && <div className="rounded-2xl bg-secondary p-4 text-sm">
          <p className="font-semibold">Hi, I'm KINAIR Submittal AI.</p>
          <p className="mt-1 text-muted-foreground">Upload the client files and give whatever project details are available. I'll use them as provided, match the available documents, and build the combined PDF. Missing project fields or empty dividers will not stop generation.</p>
        </div>}
        <label className="block text-xs font-semibold text-muted-foreground">AI provider
          <select aria-label="Submittal AI provider" value={aiMode} onChange={(event) => setAiMode(event.target.value as typeof aiMode)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground">
            <option value="auto">Automatic · Local → Free → Premium</option>
            <option value="local">KINAIR local engine</option>
            {(dynamicModelOptions.length ? dynamicModelOptions : fallbackAiModelOptions).map((model) => <option key={model.mode} value={model.mode}>{model.label}</option>)}
          </select>
        </label>
        {activeProvider && <p className="text-xs text-muted-foreground">Response from {activeProvider}</p>}
        {messages.map((message, i) => <div key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}>{message.text}</div>)}
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Preparing draft…</p>}
        {plan && <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-bold">{plan.action === "revise" ? "Final PDF from a new revision" : "Final submittal PDF"}</p>
          {plan.action === "revise" && <p className="mt-1 text-xs text-muted-foreground">Source: {records.find((record) => record.id === plan.sourceRecordId)?.ref ?? "Unknown"} Rev {records.find((record) => record.id === plan.sourceRecordId)?.rev ?? "?"}</p>}
          <label className="mt-2 block text-xs font-semibold">Submittal title
            <input aria-label="Chat submittal title" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={plan.title} onChange={(event) => setPlan((current) => current ? { ...current, title: event.target.value } : current)} />
          </label>
          <label className="mt-2 block text-xs font-semibold">PDF cover heading
            <input aria-label="Chat PDF cover heading" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={plan.coverHeading ?? ""} onChange={(event) => setPlan((current) => current ? { ...current, coverHeading: event.target.value } : current)} placeholder={plan.kind === "Material" ? `Material Submittal for ${plannedTypes.join(" & ") || seriesProductType(plan.product || "") || plan.product || "Fan"}` : "Submittal"} />
          </label>
          {plan.brand && <p>Brand: {plan.brand}</p>}
          {plan.product && <p>Product: {plannedTypes.length ? plannedTypes.join(", ") : plan.product}</p>}
          {!!plannedSeries.length && <p>Series: {plannedSeries.join(", ")}</p>}
          {!review?.detectedSeries.length && !!supportingUploads.length && <label className="mt-2 block text-xs font-semibold">
            Series shown on your schedule or TDS
            <select aria-label="Confirm product series from PDF" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={plan.confirmedSeries ?? ""} onChange={(event) => setPlan((current) => current ? { ...current, product: event.target.value, confirmedSeries: event.target.value } : current)}>
              <option value="">Select the exact series if AI could not read it</option>
              {[...new Set(seriesCatalogue.filter((name) => seriesProductType(name)))].map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>}
          {!!plan.confirmedSeries && <p className="text-emerald-700">Series confirmed by you: {plan.confirmedSeries}</p>}
          {plan.fields.length > 0 && <ul className="mt-2 space-y-1">{plan.fields.map((field, i) => <li key={i}>{field.label}: {field.value}</li>)}</ul>}
          <p className="mt-2">Index: {review?.indexMode === "keep" ? "Keep previous" : review?.indexMode ?? plan.indexMode} · {review?.sectionStatus.length ?? 0} sections</p>
          {plan.brand && !brands.some((brand) => brand.toLowerCase() === plan.brand.toLowerCase()) && <p className="mt-2 text-xs font-medium text-amber-700">This brand is not in your saved document library. Upload its certificates and catalogues here, or add them in the builder.</p>}
          {!!plan.omitSections?.length && <p className="mt-2 text-xs">Excluded by request: {plan.omitSections.join(", ")}</p>}
          {review && <div className="mt-3 space-y-2 rounded-xl bg-background p-3">
            <p className="font-semibold">Index checklist · {review.sectionStatus.filter((section) => section.count > 0).length} of {review.sectionStatus.length} sections included</p>
            <ol className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
              {review.sectionStatus.map((section, index) => <li key={index} className="flex justify-between gap-2">
                <span>{index + 1}. {section.title}</span>
                <span className={section.count ? "shrink-0 text-emerald-700" : "shrink-0 text-amber-700"}>{section.count ? `Included · ${section.count}` : "Not included"}</span>
              </li>)}
            </ol>
            {!!review.detectedSeries.length && <p className="text-emerald-700">Series found in uploaded files: {review.detectedSeries.join(", ")}. Related saved series documents will be used where available.</p>}
            {!!review.unresolvedModels.length && <p className="text-amber-700">Unverified schedule code(s): {review.unresolvedModels.join(", ")}. Please confirm the exact series; I will not attach a guessed TDS.</p>}
            {!!review.unreadableSchedules.length && <p className="text-amber-700">Schedule text is unreadable or still loading: {review.unreadableSchedules.join(", ")}.</p>}
            {!!review.undetectedSchedules.length && <p className="text-amber-700">No verified series found in: {review.undetectedSchedules.join(", ")}. Check the text read below or choose the exact series above.</p>}
            {!!review.seriesConflicts.length && <p className="text-amber-700">Schedule and TDS show different series: {review.seriesConflicts.join("; ")}. Check which documents belong to this submittal.</p>}
            {!!review.missingCover.length && <p className="text-muted-foreground">Not provided by client and left blank: {review.missingCover.join(", ")}.</p>}
            {!!review.missingDocuments.length && <p className="text-muted-foreground">No matching document: {review.missingDocuments.join(", ")}. These dividers will remain in the PDF.</p>}
            {!!review.excludedCertificates.length && <p className="text-amber-700">Saved test certificate not added because its exact series is not identified: {review.excludedCertificates.join(", ")}. Upload the matching certificate if required by this index.</p>}
            {!!review.unassignedFiles.length && <p className="text-amber-700">Choose a divider for: {review.unassignedFiles.join(", ")}.</p>}
            {!review.attachedCount && <p className="text-muted-foreground">No supporting document is attached yet; the submittal can still be generated with its cover, index and dividers.</p>}
            {ready && <p className="text-emerald-700">Ready to assemble with the existing submittal builder.</p>}
          </div>}
          {!!review?.emptyCount && <p className="mt-2 text-xs text-muted-foreground">{review.emptyCount} section(s) have no matching document; their dividers will still appear in this PDF.</p>}
          <div className="mt-3 flex gap-2"><Button onClick={() => void apply("pdf")} disabled={applying || !ready}>{applying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {applying ? "Uploading and saving…" : "Create & download final PDF"}</Button><Button variant="ghost" onClick={() => { setPlan(null); setUploads([]); setOmitEmpty(false); setConfirmedCertificateMapping(false); autoFinish.current = true; }}><X className="size-4" /> Discard</Button></div>
          <p className="mt-2 text-xs text-muted-foreground">The saved draft remains editable in the builder. Downloading the PDF does not mark it as sent to the customer.</p>
        </div>}
      </div>
      <div className="border-t border-border px-4 py-3">
        <input ref={uploadInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" className="hidden" aria-label="Select submittal files" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <Button type="button" variant="outline" className="w-full" onClick={chooseFiles} disabled={applying || busy}><FileUp className="size-4" /> Upload files</Button>
        <p className="mt-1 text-xs text-muted-foreground">Cover, index, schedule, datasheets and certificates: upload together. I'll read and sort them.</p>
        {!!uploads.length && <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold">{uploads.length} file(s) selected. {readingUploads ? "Reading uploaded files…" : "Ready for AI review."}</p>
          {uploads.map((upload, index) => <div key={index}><div className="flex items-center gap-2 rounded-lg bg-secondary p-2 text-xs">
            <span className="min-w-0 flex-1 truncate" title={upload.file.name}>{upload.file.name}</span>
            {upload.kind === "cover" || upload.kind === "index" ? <span className="text-primary">{upload.kind === "cover" ? "Cover" : "Index"}</span> : review ? <select aria-label={"Divider for " + upload.file.name} className="max-w-32 rounded-md border bg-background p-1 text-xs" value={upload.sectionTitle.startsWith("new:") ? upload.sectionTitle : review.assignments[uploads.slice(0, index).filter((item) => item.kind !== "cover" && item.kind !== "index").length] || ""} onChange={(event) => setUploads((items) => items.map((item, i) => i === index ? { ...item, sectionTitle: event.target.value } : item))}>
              <option value="">Select divider</option>
              {review.sections.map((title) => <option key={title} value={title}>{title}</option>)}
              <option value={"new:" + upload.file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 100)}>Create divider from filename</option>
            </select> : <span className="max-w-28 truncate text-muted-foreground">{upload.sectionTitle || "Auto match"}</span>}
            {(upload.scheduleText || upload.documentText) && <span className="shrink-0 text-emerald-700">{/(?:schedule|technical data sheet|datasheet|tds)/i.test(upload.sectionTitle + " " + upload.file.name) &&
              !detectScheduleSeries(upload.scheduleText ?? upload.documentText ?? "", seriesCatalogue, modelCatalog).series.length ? "Read · no series" : "Read"}</span>}
            {upload.scheduleError && <span className="shrink-0 text-amber-700">Needs review</span>}
            <button type="button" aria-label={"Remove " + upload.file.name} onClick={() => setUploads((items) => items.filter((_, i) => i !== index))}><X className="size-4" /></button>
          </div>
          {(upload.scheduleText || upload.documentText) && <details className="mx-2 mb-2 rounded-lg border bg-background p-2 text-xs">
            <summary className="cursor-pointer">View text read from {upload.file.name}</summary>
            <p className="mt-1 font-medium">{detectScheduleSeries(upload.scheduleText ?? upload.documentText ?? "", seriesCatalogue, modelCatalog).series.length
              ? `Series found: ${detectScheduleSeries(upload.scheduleText ?? upload.documentText ?? "", seriesCatalogue, modelCatalog).series.join(", ")}`
              : "No exact KINAIR series code found in the extracted text."}</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{(upload.scheduleText ?? upload.documentText ?? "").slice(0, 3000)}</pre>
          </details>}</div>)}
        </div>}
        <Button type="button" variant="secondary" size="sm" className="mt-2 w-full" onClick={() => void apply("builder")} disabled={applying || busy || !!readingUploads}>
          {applying ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Open full submittal builder {plan ? "with this plan" : ""}
        </Button>
      </div>
      {selectorLoading && uploads.some((item) => /schedule/i.test(item.sectionTitle + " " + item.file.name)) && <p role="status" className="px-4 text-xs text-muted-foreground">Loading fan and air curtain selector data…</p>}
      {(applying || pdfBuilding) && <p role="status" className="px-4 py-2 text-sm text-primary">Assembling your combined PDF. Please keep this page open…</p>}
      {pdfFailed && <p role="alert" className="px-4 py-2 text-sm text-destructive">Some pages could not be included. Check the builder notice and correct those files.</p>}
      {pdfReady && <Button type="button" className="mx-4 my-2" onClick={onDownloadPdf}><FileUp className="size-4" /> Download final submittal PDF</Button>}
      <form className="flex items-end gap-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} placeholder="Describe a submittal or a revision…" aria-label="Submittal chat message" className="min-h-12 max-h-36 resize-none" />
        <Button type="submit" size="icon" disabled={!input.trim() || busy || applying} aria-label="Send submittal request"><Send className="size-4" /></Button>
      </form>
    </SheetContent>
  </Sheet>;
}
