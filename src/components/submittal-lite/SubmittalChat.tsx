import { ProjectDetailsReuse } from "@/components/submittal-lite/ProjectDetailsReuse";
import { parseIndexHeadings } from "@/lib/submittal-lite/setup-parser";
import { indexHeadingIntent } from "@/lib/submittal-lite/library";
import { readWordInquiry } from "@/lib/submittal-lite/word-inquiry";
import { normalizeCoverFields } from "@/lib/submittal-lite/cover-fields";
import { useEffect, useRef, useState } from "react";
import { getDynamicModelOptions, fallbackAiModelOptions, type RegisteredAiModel, type AiMode } from "@/lib/ai/model-options";
import { FileUp, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/backend/client";
import { extractTextAdvanced, extractSetupText, readScannedPage } from "@/lib/submittal-lite/extract";
import { readSpecification } from "@/lib/submittal-lite/compliance-read";
import { readConsultantComments } from "@/lib/submittal-lite/rtcc-read";
import { specificationBody, specificationComment, type ComplianceSheet } from "@/lib/submittal-lite/compliance";
import { rtccCommentBody, type RtccRound } from "@/lib/submittal-lite/rtcc";
import { complianceExportTables, downloadReviewExcel, rtccExportTables } from "@/lib/submittal-lite/review-excel";
import { readReplyWorkbook, matchImportedReplies } from "@/lib/submittal-lite/review-import";
import { buildCompliancePdf } from "@/lib/submittal-lite/compliance-pdf";
import { buildReviewPdf } from "@/lib/submittal-lite/review-pdf";
import { detectScheduleSeries, isSelectorSeries, normalizeOcrModelCodes, seriesProductType, type SeriesModel } from "@/lib/submittal-lite/schedule-series";
import { makeAssistantSubmittalTds } from "@/lib/submittal-lite/selector-tds";
import { probeSelectionAssistantSchedule, readSelectionAssistantAttachment, readSelectionAssistantSchedule } from "@/lib/submittal-lite/selection-assistant-schedule";
import type { AssistantScheduleItem } from "@/lib/submittal-lite/selector-tds";
import { useSupabaseFanDatabase } from "@/hooks/useSupabaseFanDatabase";
import { useAllFanDimensions, useTenantData } from "@/hooks/useFanDatabase";
import { useAirCurtainModels, useAirCurtainBrands, useAirCurtainSeries, useAirCurtainDimensions } from "@/hooks/useAirCurtains";
import { loadRegisteredSeriesTds, loadSelectorModelCatalogue } from "@/lib/submittal-lite/selector-models";
import type { SubmittalRecord, Kind, Field } from "@/lib/submittal-lite/records";
import { isSpreadsheet, spreadsheetToText, pdfToText } from "@/lib/chatSchedule";

export type SubmittalChatPlan = {
  technicalIssues?: string[];
  companyId?: string; brandId?: string; action: "create" | "revise" | "clarify"; sourceRecordId: string; kind: Kind;
  title: string; coverHeading?: string; explicitIndexMode?: boolean; brand: string; product: string; confirmedSeries?: string; indexMode: "general" | "project" | "customer" | "keep";
  fields: { label: string; value: string }[]; sections: string[]; omitSections: string[]; reply: string;
};
type Message = { role: "user" | "assistant"; text: string };

function parseClientProjectFields(text: string): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [];
  const aliases: Array<[RegExp, string]> = [
    [/^project(?:\s+name)?$/i, "Project Name"],
    [/^plot(?:\s*(?:no\.?|number))?(?:\s*\/\s*|\s+)?(?:loc\.?|location)?$/i, "Plot No./Loc"],
    [/^location$/i, "Location"],
    [/^client(?:\s+name)?$/i, "Client"],
    [/^(?:mep\s+)?consultant(?:\s+name)?$/i, "Consultant"],
    [/^(?:main|civil)\s+contractor$/i, "Main Contractor"],
    [/^(?:mep|hvac|hvc|mvp)\s+contractor$/i, "MEP Contractor"],
    [/^(?:supplier(?:\s+name)?|submitted\s+by|company)$/i, "Supplier Name"],
    [/^(?:brand(?:\s+name)?|manufacturer|make)$/i, "Brand Name"],
  ];
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.trim().match(/^([^:]{2,45})\s*:\s*(.+)$/);
    if (!match) continue;
    const rawLabel = match[1].trim();
    const value = match[2].trim();
    if (!value) continue;
    const alias = aliases.find(([pattern]) => pattern.test(rawLabel));
    if (!alias) continue;
    // Preserve the customer's visible wording for the cover. Canonical matching
    // still happens later in the core builder through coverKey().
    fields.push({ label: rawLabel || alias[1], value });
  }
  return fields;
}

function parsePastedIndexSections(text: string): string[] {
  return parseIndexHeadings(text);
}
const inferMaterialTypes = (text: string) => {
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

function isQuotationText(text: string): boolean {
  // A quotation title, validity or payment terms do not mean prices exist.
  return /(?:AED|USD|INR|SAR|QAR|EUR|GBP|د\.إ|\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:AED|USD|INR|SAR|QAR|EUR|GBP)\b/i.test(text)
    || /(?:unit\s*(?:price|rate)|total\s*(?:price|amount)|net\s*amount|price)\s*[:=]\s*[\d,]+(?:\.\d+)?/i.test(text)
    || (/\b(?:unit\s*price|unit\s*rate|total\s*amount)\b/i.test(text) && /(?:^|[\t| ])\d[\d,]*\.\d{2}\s*(?:$|[\t|])/m.test(text));
}

function parseSourceReferenceFields(text: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^([^:]{2,45})\s*:\s*(.{2,160})$/)
      ?? line.match(/^((?:quotation|quote)(?:\s*(?:no\.?|number|ref(?:erence)?))?|(?:our\s+)?ref(?:erence)?(?:\s*no\.?)?)\s+(.{2,160})$/i);
    if (!match) continue;
    const label = match[1].trim();
    const value = match[2].trim();
    if (!value) continue;
    if (/^(?:quotation|quote)(?:\s*(?:no\.?|number|ref(?:erence)?))?$|^(?:our\s+)?ref(?:erence)?(?:\s*no\.?)?$/i.test(label)) {
      out.push({ label, value });
    }
  }
  return out.slice(0, 3);
}

function uniqueProjectDetails(fields: { label: string; value: string }[]) {
  return normalizeCoverFields(fields);
}

export type ChatUpload = { pageMode?: "uploaded" | "generated"; uploadPurpose?: string; file: File; sectionTitle: string; kind?: "cover" | "index" | "support"; scheduleText?: string; documentText?: string; scheduleError?: string; selectionItems?: AssistantScheduleItem[]; selectionProvider?: string; selectionOptimizeFor?: string; readMethods?: string[]; readWarnings?: string[]; directReadProvider?: string; sourceRole?: "schedule" | "quotation"; excludeFromPdf?: boolean };
type ChatReplyWorkflow =
  | { kind:"compliance"; sourceName:string; fields:Field[]; sheet:ComplianceSheet; excelImported:boolean }
  | { kind:"rtcc"; sourceName:string; fields:Field[]; rounds:RtccRound[]; excelImported:boolean };
function submittalMessageIntent(message: string): "repair" | "question" | "build" {
  if (/\b(?:missing|missed|not included|not loaded|didn['’]?t include|haven['’]?t included|recheck|re-check|retry|repair|rework|re-work|fix|wrong|incorrect)\b/i.test(message)) return "repair";
  if (/\?|^(?:why|how|what|where|which|can you|could you|please explain|explain|tell me|hello|hi|thanks)\b/i.test(message.trim())) return "question";
  return "build";
}

export type ChatInspection = { sections: string[]; indexMode: "general" | "project" | "customer" | "keep"; sectionStatus: { title: string; count: number }[]; assignments: string[]; missingCover: string[]; missingDocuments: string[]; unassignedFiles: string[]; attachedCount: number; omittedCount: number; emptyCount: number; detectedSeries: string[]; unresolvedModels: string[]; unreadableSchedules: string[]; undetectedSchedules: string[]; seriesConflicts: string[]; unverifiedCertificates: string[]; excludedCertificates: string[] };

function classifyUpload(_file: File, text: string): { kind: "cover" | "index" | "support"; sectionTitle: string; isSchedule: boolean } {
  const sample = text.slice(0, 12000).toLowerCase();
  const first = sample.slice(0, 1800);
  const coverFields = ["project name", "client name", "consultant", "main contractor", "mep contractor", "supplier name", "brand name", "plot no", "location"].filter((field) => sample.includes(field)).length;
  const aliasIndexHeadings = new Set(text.split(/\r?\n/).map(line => indexHeadingIntent(line.replace(/^\s*\d+[.)\-:]?\s+/, "").replace(/\s+(?:\.{2,}\s*)?\d+\s*$/, ""))).filter(Boolean)).size;
  const indexLines = text.split(/\r?\n/).filter((line) => /^\s*(?:\d{1,2}[.)\-:]\s*|section\s+\d+\s+)/i.test(line)).length;
  const indexHeadings = Math.max(aliasIndexHeadings, ["company profile", "material schedule", "technical data sheet", "compliance statement", "test certificate", "warranty", "iso certificate", "project approval"].filter((field) => sample.includes(field)).length);

  const documentHeading = first.split(/\r?\n/).map(line => line.trim().replace(/\s*[:–]\s+.*$/, "")).find(line => {
    const type = indexHeadingIntent(line);
    // Abbreviations and generic headings need supporting content, as required
    // by the training reference (e.g. an HR appointment is not OEM authority).
    if (type === "authorization" && /^(?:mal|maf|appointment letter)$/i.test(line))
      return /authori[sz]|distributor|dealer|representation|principal|oem|manufacturer/.test(sample);
    if (type === "origin" && /^(?:coo|c\/o|c\.o\.o\.|origin)$/i.test(line))
      return /manufactur|made[ -]in|country|production|origin declaration/.test(sample);
    if (type === "manual" && !/install|mount|erect|assembl/i.test(line))
      return /install|mount|erect|assembl|wiring|connection instructions/.test(sample);
    return Boolean(type);
  });
  const headingIntent = documentHeading ? indexHeadingIntent(documentHeading) : undefined;
  const headingSections: Record<string, string> = {
    "company-profile": "Company profile", schedule: "Material schedule", catalogue: "Product catalogue",
    datasheet: "Technical data sheet", "project-spec": "Project specification", compliance: "Compliance statement",
    test: "Test certificate", warranty: "Warranty", license: "Trade certificate", iso: "ISO certificate", approval: "Previous project approvals",
    manual: "Installation guide", origin: "Country of origin", authorization: "Manufacturer authorization letter",
  };
  if (headingIntent && !(indexLines >= 4 && indexHeadings >= 2 || indexHeadings >= 5 && coverFields < 2)) {
    const title = headingIntent === "compliance" && /general|project|specification|clause|product|standard/i.test(documentHeading!) ? documentHeading! : headingSections[headingIntent];
    if (title) return { kind: "support", sectionTitle: title, isSchedule: headingIntent === "schedule" };
  }
  // Content only: filename never determines document type.
  if (indexLines >= 4 && indexHeadings >= 2 || indexHeadings >= 5 && coverFields < 2) {
    return { kind: "index", sectionTitle: "Customer index", isSchedule: false };
  }

  const scheduleSignals =
    (/\b(?:material|equipment|fan|air curtain)\s*(?:selection\s*)?schedule\b/.test(sample) ? 3 : 0) +
    (/\b(?:airflow|flow rate|cfm|cmh|l\/s)\b/.test(sample) ? 1 : 0) +
    (/\b(?:static pressure|esp|pressure|pa|mmwg)\b/.test(sample) ? 1 : 0) +
    (/\b(?:model|model no|model number|tag no|item no|qty|quantity)\b/.test(sample) ? 1 : 0) +
    (/\b(?:kvf[-\s]?\d{2,4}(?:mr|m|p)|kin[-\s]?\d{2,4}e|ktaf|fm[-\s]?\d{4})\b/i.test(text) ? 2 : 0);
  const isSchedule = scheduleSignals >= 3;
  if (isSchedule) return { kind: "support", sectionTitle: "Material schedule", isSchedule: true };

  if (coverFields >= 4 && indexLines < 3) return { kind: "cover", sectionTitle: "Cover page", isSchedule: false };
  if (/\b(?:technical\s*data\s*sheet|datasheet|tds|product\s*data\s*sheet|performance\s*data)\b/.test(first)) return { kind: "support", sectionTitle: "Technical data sheet", isSchedule: false };
  if (/\b(?:consultant(?:[’\']s)?\s+comments?|comments?\s+by\s+consultant|reply\s+to\s+consultant\s+comments?|rtcc)\b/.test(sample)) return { kind: "support", sectionTitle: "Consultant comments", isSchedule: false };
  if (/\bproject\s*specification\b/.test(first) || (/^\s*SECTION\s+\d{4,}\b/im.test(text) && /^\s*PART\s+\d+\b/im.test(text))) return { kind: "support", sectionTitle: "Project specification", isSchedule: false };
  if (/\b(?:compliance|conformity|deviation)\b/.test(first)) return { kind: "support", sectionTitle: "Compliance statement", isSchedule: false };
  if (/\b(?:test\s*(?:report|certificate)|performance\s*certificate)\b/.test(first)) return { kind: "support", sectionTitle: "Test certificate", isSchedule: false };
  if (/\b(?:iso\s*(?:9001|14001|45001)|iso\s*certificate)\b/.test(first)) return { kind: "support", sectionTitle: "ISO certificate", isSchedule: false };
  if (/\b(?:warranty|guarantee)\b/.test(first)) return { kind: "support", sectionTitle: "Warranty", isSchedule: false };
  if (/\b(?:company\s*profile|company\s*statement)\b/.test(first)) return { kind: "support", sectionTitle: "Company profile", isSchedule: false };
  if (/\b(?:trade\s*licen[cs]e|trade\s*certificate)\b/.test(first)) return { kind: "support", sectionTitle: "Trade certificate", isSchedule: false };
  if (/\b(?:previous\s*project\s*approval|approval\s*copy|approved\s*submittal)\b/.test(first)) return { kind: "support", sectionTitle: "Previous project approvals", isSchedule: false };
  if (/\b(?:product\s*catalogue|catalog|brochure)\b/.test(first)) return { kind: "support", sectionTitle: "Product catalogue", isSchedule: false };
  return { kind: "support", sectionTitle: "", isSchedule: false };
}

type ChatWorkflowChoice = Kind | "Compliance" | "RTCC";
type ChatSessionSeed = {
  uploads?: ChatUpload[]; input?: string; coverDetailsText?: string; customIndexText?: string;
  indexChoice?: "general" | "project" | "customer" | null; submittalKind?: Kind; workflowChoice?: ChatWorkflowChoice; scheduleMode?: "uploaded" | "ai";
};
type SubmittalChatProps = {
  companyOptions?: { id: string; name: string }[]; brandOptions?: { id: string; name: string }[];
  selectedCompanyId?: string; selectedBrandId?: string;
  onCompanyChange?: (id: string) => void; onBrandChange?: (id: string) => void;
  open: boolean; onOpenChange: (value: boolean) => void; records: SubmittalRecord[];
  brands: string[]; seriesCatalogue: string[]; modelCatalog: SeriesModel[]; tenantId: string; currentRecordId?: string; inspectPlan: (plan: SubmittalChatPlan, uploads: ChatUpload[], omitEmpty: boolean) => ChatInspection;
  onApply: (plan: SubmittalChatPlan, uploads: ChatUpload[], omitEmpty: boolean, destination: "pdf" | "builder", confirmedCertificateMapping: boolean) => Promise<string>;
  onOpenBuilder: () => void;
  onOpenRtcc?: () => void;
  onOpenCompliance?: () => void;
  pdfBuilding: boolean; pdfReady: boolean; pdfPrepared: boolean; pdfFailed: boolean; pdfError?: string; onDownloadPdf: () => void; onSharePdf: () => Promise<{ url: string; expiresAt: string }>; mobileMode?: boolean; scheduleBranding?: { companyName?: string; companyLogo?: string; brandLogo?: string; stamp?: string };
};
export function SubmittalChat(props: SubmittalChatProps) {
  const [session, setSession] = useState({ id: 0, seed: {} as ChatSessionSeed });
  return <SubmittalChatSession key={session.id} {...props} initialSeed={session.seed} newSession={session.id > 0}
    onRestart={(seed = {}) => setSession(current => ({ id: current.id + 1, seed }))} />;
}
function SubmittalChatSession({ companyOptions, brandOptions, selectedCompanyId, selectedBrandId, onCompanyChange, onBrandChange, open, onOpenChange, records, brands, seriesCatalogue, modelCatalog, tenantId, currentRecordId, inspectPlan, onApply, onOpenBuilder, onOpenRtcc, onOpenCompliance, pdfBuilding, pdfReady, pdfPrepared, pdfFailed, pdfError, onDownloadPdf, onSharePdf, scheduleBranding, mobileMode, initialSeed = {}, newSession = false, onRestart }: SubmittalChatProps & {
  initialSeed?: ChatSessionSeed; newSession?: boolean; onRestart?: (seed?: ChatSessionSeed) => void;
}) {
  const { database, isLoading: fanLoading } = useSupabaseFanDatabase();
  const { data: dimensionsMap, isLoading: dimensionLoading } = useAllFanDimensions();
  const { data: tenant, isLoading: tenantLoading } = useTenantData();
  const { data: airModels = [], isLoading: airLoading } = useAirCurtainModels();
  const { data: airBrands = [] } = useAirCurtainBrands();
  const { data: airSeries = [] } = useAirCurtainSeries();
  const { data: airDimensions = [] } = useAirCurtainDimensions();
  const selectorLoading = fanLoading || airLoading || dimensionLoading || tenantLoading;
  const [shareResult, setShareResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [tdsWarnings, setTdsWarnings] = useState<string[]>([]);
  const [input, setInput] = useState(initialSeed.input ?? "");
  const [setupOpen, setSetupOpen] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [showSavedPdf, setShowSavedPdf] = useState(false);
  const [freshSession, setFreshSession] = useState(newSession);
  const [scheduleMode, setScheduleMode] = useState<"uploaded" | "ai">(initialSeed.scheduleMode ?? "uploaded");
  const [submittalKind, setSubmittalKind] = useState<Kind>(initialSeed.submittalKind ?? "Material");
  const [workflowChoice,setWorkflowChoice]=useState<ChatWorkflowChoice>(initialSeed.workflowChoice ?? initialSeed.submittalKind ?? "Material");
  const [indexChoice, setIndexChoice] = useState<"general" | "project" | "customer" | null>(initialSeed.indexChoice ?? "general");
  const [customIndexText, setCustomIndexText] = useState(initialSeed.customIndexText ?? "");
  const [coverDetailsText, setCoverDetailsText] = useState(initialSeed.coverDetailsText ?? "");
  const coverUploadRef = useRef<HTMLInputElement>(null);
  const targetedUploadRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string>("Project Specification");
  const [messages, setMessages] = useState<Message[]>([]);
  const [plan, setPlan] = useState<SubmittalChatPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingUploads, setReadingUploads] = useState(0);
  const [aiMode, setAiMode] = useState<AiMode | "local">("auto");
  const [activeProvider, setActiveProvider] = useState("");
  const [selectionArtifacts, setSelectionArtifacts] = useState<{ schedule?: File; tds?: File; models: string[] } | null>(null);
  const [availableModels, setAvailableModels] = useState<RegisteredAiModel[]>([]);
  const [visualViewport, setVisualViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const viewport = window.visualViewport;
    const sync = () => setVisualViewport(viewport
      ? { height: Math.round(viewport.height), top: Math.round(viewport.offsetTop) }
      : { height: window.innerHeight, top: 0 });
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [open]);
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
  const [uploads, setUploads] = useState<ChatUpload[]>(initialSeed.uploads ?? []);
  const [omitEmpty, setOmitEmpty] = useState(false);
  const [confirmedCertificateMapping, setConfirmedCertificateMapping] = useState(false);
  const [composePending, setComposePending] = useState(Boolean(initialSeed.uploads?.length));
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replyExcelInputRef = useRef<HTMLInputElement>(null);
  const [replyWorkflow,setReplyWorkflow] = useState<ChatReplyWorkflow | null>(null);
  const [replyWorkflowBusy,setReplyWorkflowBusy] = useState(false);
  const [replyWorkflowProgress,setReplyWorkflowProgress] = useState("");
  const autoFinish = useRef(true);
  const startNewSubmittal = () => {
    if (!completed && (busy || applying || readingUploads)) return;
    if (onRestart) { onRestart(); return; }
    setShareResult(null); setShareError(""); setShareCopied(false); setTdsWarnings([]);
    setInput(""); setMessages([]); setPlan(null); setUploads([]);
    setCoverDetailsText(""); setCustomIndexText(""); setIndexChoice("general"); setSubmittalKind("Material"); setWorkflowChoice("Material"); setScheduleMode("uploaded");
    setSelectionArtifacts(null); setReplyWorkflow(null); setReplyWorkflowProgress(""); setActiveProvider(""); setOmitEmpty(false);
    setConfirmedCertificateMapping(false); setComposePending(false);
    setCompleted(false); setShowSavedPdf(false); setFreshSession(true); setSetupOpen(true);
    autoFinish.current = true;
    for (const ref of [uploadInputRef, coverUploadRef, targetedUploadRef, replyExcelInputRef]) if (ref.current) ref.current.value = "";
  };
  const finishSubmittal = () => {
    setBusy(false); setApplying(false); setReadingUploads(0);
    // Retain the source files and plan for questions and repairs after download.
    // New submittal (or a new attachment batch after completion) resets them.
    setComposePending(false); setCompleted(true); setShowSavedPdf(true); setFreshSession(false);
    autoFinish.current = true;
  };
  const supportingUploads = uploads.filter((upload) => upload.kind !== "cover" && upload.kind !== "index" && !upload.excludeFromPdf);
  const assignmentForUpload = (upload: ChatUpload) => { const i = supportingUploads.indexOf(upload); return i >= 0 ? (review?.assignments[i] ?? "") : ""; };
  const review = plan && !composePending ? inspectPlan(plan, supportingUploads, omitEmpty) : null;
  const plannedSeries = plan ? detectScheduleSeries([plan.product, ...uploads.map((item) => item.scheduleText ?? item.documentText ?? "")].join("\n"), seriesCatalogue, modelCatalog).series : [];
  const plannedSeriesTypes = [...new Set(plannedSeries.map((name) => seriesProductType(name, modelCatalog)).filter(Boolean))];
  const plannedTypes = plannedSeriesTypes.length
    ? plannedSeriesTypes
    : inferMaterialTypes([plan?.product ?? "", ...uploads.map((item) => item.scheduleText ?? item.documentText ?? "")].join("\n"));
  const tdsNeeded = Boolean(plan && uploads.some((item) => item.sectionTitle === "Material schedule" || Boolean(item.selectionItems?.length)) && review?.sectionStatus.some((item) => /technical data sheet|datasheet|tds/i.test(item.title) && !item.count));
  const ready = !readingUploads && Boolean(review) && !review?.unassignedFiles.length && !review?.sectionStatus.some(section => section.count === 0);
  const typedWorkflowChoice=(value:string):ChatWorkflowChoice|undefined=>{
    if(/\b(?:compliance\s+statement|specification\s+compliance)\b/i.test(value))return "Compliance";
    if(/\b(?:rtcc|reply\s+to\s+(?:consultant\s+)?comments?)\b/i.test(value))return "RTCC";
    if(/\b(?:pre[- ]?qualification|pq\s+submittal)\b/i.test(value))return "PQ";
    if(/\b(?:o\s*&\s*m|operation\s*(?:&|and)\s*maintenance)\b/i.test(value))return "O&M";
    if(/\bmaterial\s+submittal\b/i.test(value))return "Material";
  };
  const ask = async (question = input) => {
    let currentTechnicalIssues: string[] = [];
    if (sharing || busy || applying || (!question.trim() && !coverDetailsText.trim() && !uploads.length && !customIndexText.trim())) return;
    let intent = submittalMessageIntent(question);
    const followUp = Boolean(plan && question.trim() && !composePending);
    if (intent === "question" || (followUp && intent !== "repair" && !/\b(?:build|create|generate|download|finish)\b/i.test(question))) {
      setInput(""); setBusy(true);
      setMessages(items => [...items, { role: "user", text: question }]);
      try {
        const result = await supabase.functions.invoke("submittal-assistant", { body: {
          action: "conversation", message: question, aiMode, history: messages.slice(-8),
          draftPlan: plan, checklist: review, warnings: tdsWarnings,
          documents: uploads.map(item => ({ filename: item.file.name, section: item.sectionTitle })),
        } });
        if (result.error) throw result.error;
        if (!result.data?.reply) throw new Error("No chat response returned");
        setMessages(items => [...items, { role: "assistant", text: result.data.reply }]);
        setActiveProvider(result.data.provider ?? "KINAIR local engine");
        if (result.data.intent === "answer") return;
        intent = result.data.intent === "repair" ? "repair" : "build";
      } catch {
        setMessages(items => [...items, { role: "assistant", text: "I couldn't reach the chat service. Your files and current submittal are preserved. Please retry, or use Recheck missing documents below." }]);
        return;
      } finally { setBusy(false); }
    }
    const repairing = intent === "repair";
    const continuingRevision = repairing || followUp || /\b(?:revise|revision|update)\b/i.test(question);
    const isNewRequest = !continuingRevision && (freshSession || completed);
    const requestMessages = isNewRequest ? [] : messages;
    const explicitWorkflow=typedWorkflowChoice(question);
    const effectiveWorkflow=explicitWorkflow ?? workflowChoice;
    const customSections = parsePastedIndexSections(customIndexText);
    if ((effectiveWorkflow==="Material"||effectiveWorkflow==="PQ"||effectiveWorkflow==="O&M") && indexChoice === "customer" && !customSections.length && !uploads.some(upload => upload.kind === "index")) {
      setMessages(items => [...items, { role: "assistant", text: "Please paste your custom index headings or upload the customer index, then press Send." }]);
      return;
    }
    const indexInstruction = indexChoice === "project" ? "Use Project Specification index." : indexChoice === "customer" ? "Use Custom Index." : indexChoice === "general" ? "Use General Specification index." : "";
    const coreKind:Kind=effectiveWorkflow==="Compliance"||effectiveWorkflow==="RTCC"?submittalKind:effectiveWorkflow;
    const text = [question.trim() || (effectiveWorkflow==="Compliance"?"Prepare Compliance Statement.":effectiveWorkflow==="RTCC"?"Prepare RTCC.":`Build ${coreKind} submittal.`), `Selected workflow: ${effectiveWorkflow}. Use this selected workflow.`, coverDetailsText.trim(), companyOptions ? `Supplier company: ${companyOptions.find(item => item.id === selectedCompanyId)?.name ?? ""}. Brand: ${brandOptions?.find(item => item.id === selectedBrandId)?.name ?? ""}. Use only this selected company and brand.` : "", (effectiveWorkflow==="Material"||effectiveWorkflow==="PQ"||effectiveWorkflow==="O&M")?indexInstruction:"", (effectiveWorkflow==="Material"||effectiveWorkflow==="PQ"||effectiveWorkflow==="O&M")&&indexChoice === "customer" && customSections.length ? customSections.map((line, i) => `${i + 1}. ${line}`).join("\n") : ""].filter(Boolean).join("\n");
    if (!text || busy || applying) return;
    setShareResult(null); setShareError(""); setShareCopied(false); setTdsWarnings([]);
    setInput(""); setBusy(true); setSetupOpen(false);
    setCompleted(false); setShowSavedPdf(false);
    setMessages(items => [...(isNewRequest ? [] : items), { role: "user", text: question.trim() || text }]);
    if (repairing) {
      autoFinish.current = false;
      setMessages(items => [...items, { role: "assistant", text: "I'll recheck the uploaded files and saved document matches, retry matching TDS from the schedule, and list anything that still needs uploading. I will keep your supplied models, parameters and custom index." }]);
    }
    try {
      const requestUploads = await prepareUploadsForSend();
      const consultantSource=requestUploads.find(upload=>/\b(?:consultant(?:[’']s)?\s+comments?|comments?\s+by\s+consultant|reply\s+to\s+consultant\s+comments?|rtcc)\b/i.test(upload.sectionTitle+"\n"+(upload.documentText??"")));
      const specificationSource=requestUploads.find(upload=>!consultantSource||upload!==consultantSource
        ? /project\s*specification/i.test(upload.sectionTitle+"\n"+(upload.documentText??"")) || (/^\s*SECTION\s+\d{4,}\b/im.test(upload.documentText??"")&&/^\s*PART\s+\d+\b/im.test(upload.documentText??""))
        : false);
      if(effectiveWorkflow==="Compliance"||effectiveWorkflow==="RTCC"){
        const preferred=effectiveWorkflow==="Compliance"?specificationSource:consultantSource;
        const fallback=requestUploads.find(upload=>upload.kind!=="cover"&&upload.kind!=="index"&&upload.uploadPurpose!=="Quotation");
        const source=preferred??fallback;
        if(!source)throw new Error(effectiveWorkflow==="Compliance"?"Upload the project specification first.":"Upload the consultant comments first.");
        await prepareReplyWorkflow(effectiveWorkflow==="Compliance"?"compliance":"rtcc",source);
        return;
      }
      if (companyOptions && (!companyOptions.some(item => item.id === selectedCompanyId) || !brandOptions?.some(item => item.id === selectedBrandId))) {
        setSetupOpen(true);
        setMessages(items => [...items, { role: "assistant", text: "Please select the supplier company and brand in Project setup before preparing this submittal." }]);
        return;
      }
      const supportingUploadsSnapshot = requestUploads.filter((upload) => upload.kind !== "cover" && upload.kind !== "index" && !upload.excludeFromPdf);
      const userConversation = [...requestMessages.filter((message) => message.role === "user").map((message) => message.text), text].join("\n");
      const hasCustomerIndex = requestUploads.some((upload) => upload.kind === "index");
      const hasProjectSpecification = requestUploads.some((upload) => /project\s*specification/i.test(upload.sectionTitle + "\n" + (upload.documentText ?? "")));
      const hasCompliance = requestUploads.some((upload) => /\b(?:compliance|conformity|deviation)\b/i.test(upload.sectionTitle + "\n" + (upload.documentText ?? "")));
      const hasProjectDetails = requestUploads.some((upload) => upload.kind === "cover") ||
        /\b(?:project(?:\s+name)?|plot(?:\s+no\.?|\s+location)?|client|consultant|main\s+contractor|mep\s+contractor)\s*[:=-]/i.test(userConversation);
      const pastedCustomIndex = (indexChoice === "customer" && customSections.length > 0) || text.split(/\r?\n/).filter((line) => /^\s*(?:\d{1,2}[.)\-:]\s*|section\s+\d+\s+)/i.test(line)).length >= 4;
      const choseCustom = indexChoice ? indexChoice === "customer" : hasCustomerIndex || pastedCustomIndex || /\bcustom(?:er)?\s+index\b|\bcustom\b/i.test(userConversation);
      const choseProject = indexChoice ? indexChoice === "project" : !choseCustom && (
        /\bproject\s+(?:specification|spec|index)\b/i.test(userConversation) ||
        hasProjectSpecification ||
        hasCompliance
      );
      const selectionText = [userConversation, ...requestUploads.map((upload) => upload.scheduleText ?? upload.documentText ?? "")].filter(Boolean).join("\n");
      const hasSelectionInput = requestUploads.some((upload) => Boolean(upload.selectionItems?.length) || Boolean(upload.sourceRole) || upload.sectionTitle === "Material schedule") ||
        /\b(?:fan|air\s*curtain|airflow|cfm|cmh|l\s*\/\s*s|lps|static\s*pressure|\bpa\b|door\s*(?:width|height)|opening)\b/i.test(selectionText);
      // Natural intent: Schedule + pasted/client project details means "build Material Submittal".
      // Index priority: Customer > Project Specification/Compliance > General.
      const wantsSubmittal = explicitlyWantsSubmittal ||
        (hasSelectionInput && hasProjectDetails) ||
        hasCustomerIndex ||
        hasProjectSpecification ||
        hasCompliance;

      const sourceTextForMetadata = requestUploads
        .filter((upload) => upload.kind === "cover")
        .map((upload) => upload.documentText ?? "")
        .filter(Boolean)
        .join("\n");
      const scheduleProjectDetails = uniqueProjectDetails([
        ...parseClientProjectFields([userConversation, sourceTextForMetadata].join("\n")),
        ...parseSourceReferenceFields(sourceTextForMetadata),
        { label: "Date", value: new Date().toLocaleDateString("en-GB") },
      ]);

      const runSelectionAssistant = async () => {
        const probedItems = requestUploads.flatMap((item) => item.selectionItems ?? []);
        const probedProvider = requestUploads.find((item) => item.selectionItems?.length)?.selectionProvider ?? "";
        const probedOptimize = requestUploads.find((item) => item.selectionItems?.length)?.selectionOptimizeFor;
        let selection;
        if (probedItems.length && !requestUploads.some(item => (item.sourceRole || item.sectionTitle === "Material schedule") && !item.selectionItems?.length)) {
          selection = { items: probedItems, provider: probedProvider, optimizeFor: probedOptimize };
        } else {
          const unreadSchedule = requestUploads.find((item) =>
            (item.sourceRole === "schedule" || item.sectionTitle === "Material schedule" || /\bschedule\b/i.test(item.file.name)) &&
            !(item.scheduleText ?? item.documentText ?? "").trim());
          try {
            selection = unreadSchedule
              ? await readSelectionAssistantAttachment(unreadSchedule.file, "Read every real equipment row. Preserve tag, quantity, units, selected model and duty.", aiMode)
              : await readSelectionAssistantSchedule(selectionText, text, aiMode);
          } catch (textError) {
            const originals = requestUploads.filter(item => item.sourceRole || item.sectionTitle === "Material schedule" || /schedule|quotation/i.test(item.file.name));
            if (!originals.length) throw textError;
            setMessages(items => [...items,{role:"assistant",text:"The text reader could not identify schedule rows. Re-reading the original attachment visually before generating TDS…"}]);
            const recovered = [];
            for (const original of originals) {
              const result = await readSelectionAssistantAttachment(original.file, "Read every equipment row directly from the original table image. Preserve row tags, quantities, model codes and units. Distinguish equipment tags from proposed model codes. Return all rows, not a summary.", aiMode, true);
              if (!result.items.length) throw new Error(`No equipment rows could be verified in ${original.file.name}. Upload a clearer original schedule.`);
              recovered.push(result);
            }
            selection = {items:recovered.flatMap(result=>result.items),provider:recovered.map(result=>result.provider).filter(Boolean).join(", "),optimizeFor:recovered[0]?.optimizeFor};
          }
          if (unreadSchedule && selection.items.length) {
            const recoveredText = selection.items.map((item) => [item.tag, item.product, item.series_name, item.existing_selection].filter(Boolean).join(" | ")).join("\n");
            setUploads((items) => items.map((item) => item.file === unreadSchedule.file ? {
              ...item, scheduleText: recoveredText, scheduleError: undefined,
              selectionItems: selection.items, selectionProvider: selection.provider,
              selectionOptimizeFor: selection.optimizeFor,
            } : item));
          }
        }
        setActiveProvider(selection.provider ? `Selection Assistant · ${selection.provider}` : "KINAIR Selection Assistant");
        const needsDimensions = (item: AssistantScheduleItem) => item.product === "air_curtain"
          ? !(item.door_width && item.door_width_unit && item.door_height && item.door_height_unit)
          : !(item.airflow && item.airflow_unit && item.static_pressure != null && item.pressure_unit);
        const recoveryWarnings: string[] = [];
        if (selection.items.some(needsDimensions)) {
          // Normal extraction uses local PDF/Excel reading and cheap automatic AI.
          // Escalate one tier at a time, stopping as soon as required data are complete.
          for (const recoveryMode of ["openai_terra", "openai_sol"] as const) {
          setMessages(items => [...items, { role: "assistant", text: `Required technical data are incomplete. Checking original table images with ${recoveryMode === "openai_terra" ? "medium" : "premium"} OpenAI…` }]);
          for (const source of requestUploads.filter(upload => upload.sourceRole || /schedule|quotation/i.test(upload.sectionTitle + " " + upload.file.name))) {
            try {
              const recovered = await readSelectionAssistantAttachment(source.file,
                `QUALITY RECOVERY: Inspect the original table images, not just text order. Extract all rows with their exact tags. Air curtains: door opening WIDTH and HEIGHT with printed units, including multi-level headers. Fans: airflow and external static pressure with units. Preserve exact models and quantities; a subtotal/combined-performance line is NOT an additional unit. Verify multi-unit arrangements and table totals. Do not infer door dimensions from model length or air throw. Leave truly absent data null. Unresolved tags: ${selection.items.filter(needsDimensions).map(item => item.tag).join(", ")}`,
                recoveryMode, true);
              const key = (tag?: string | null) => (tag ?? "").trim().toLowerCase().replace(/\s+/g, " ");
              selection.items = selection.items.map(item => {
                if (!key(item.tag)) return item;
                const matches = recovered.items.filter(candidate => candidate.product === item.product && key(candidate.tag) === key(item.tag));
                if (matches.length !== 1) return item;
                const candidate = matches[0];
                if (item.quantity != null && candidate.quantity != null && item.quantity !== candidate.quantity) recoveryWarnings.push(`${item.tag}: quantity differs between reads (${item.quantity} versus ${candidate.quantity}); verify against the original schedule`);
                return { ...item,
                  ...((!item.airflow || !item.airflow_unit) && candidate.airflow && candidate.airflow_unit ? { airflow: candidate.airflow, airflow_unit: candidate.airflow_unit } : {}),
                  ...((item.static_pressure == null || !item.pressure_unit) && candidate.static_pressure != null && candidate.pressure_unit ? { static_pressure: candidate.static_pressure, pressure_unit: candidate.pressure_unit } : {}),
                  ...((!item.door_width || !item.door_width_unit) && candidate.door_width && candidate.door_width_unit ? { door_width: candidate.door_width, door_width_unit: candidate.door_width_unit } : {}),
                  ...((!item.door_height || !item.door_height_unit) && candidate.door_height && candidate.door_height_unit ? { door_height: candidate.door_height, door_height_unit: candidate.door_height_unit } : {}),
                };
              });
            } catch { /* Preserve the original rows and report unresolved data below. */ }
            if (!selection.items.some(needsDimensions)) break;
          }
          if (!selection.items.some(needsDimensions)) break;
          }
        }
        const correctionCatalog = modelCatalog.length ? modelCatalog : await loadSelectorModelCatalogue(tenantId);
        const corrections: string[] = [];
        selection.items = selection.items.map(item => {
          const original = item.existing_selection || "";
          const corrected = normalizeOcrModelCodes(original, correctionCatalog);
          if (!original || corrected === original) return item;
          corrections.push(`${item.tag || "Item"}: ${original} → ${corrected}`);
          const matched = correctionCatalog.find(model => model.code === corrected);
          return {...item, existing_selection:corrected, ...(matched ? {series_name:matched.series} : {}),
            ...(item.proposed?.model === original ? {proposed:{...item.proposed,model:corrected}} : {})};
        });
        if (corrections.length) setMessages(items => [...items,{role:"assistant",text:"Catalogue-verified OCR corrections (original uploaded schedule unchanged): " + corrections.join("; ")}]);
        const generated = await makeAssistantSubmittalTds(
          selection.items,
          { database, airModels, airBrands, airSeries, airDimensions, dimensionsMap,
            companyName: scheduleBranding?.companyName ?? tenant?.name, logoUrl: scheduleBranding?.companyLogo, brandLogoUrl: scheduleBranding?.brandLogo, projectDetails: scheduleProjectDetails },
          (["balanced", "low_noise", "high_efficiency", "low_power", "smallest_size"].includes(selection.optimizeFor ?? "")
            ? selection.optimizeFor : "balanced") as import("@/lib/chatOptimize").FanOptimizeFor,
        );
        setTdsWarnings([...generated.missing, ...recoveryWarnings]);
        currentTechnicalIssues = [...generated.missing];
        return { selection, generated };
      };

      // Inquiry / schedule mode: do selection work first and do not create a submittal yet.
      if (!wantsSubmittal && hasSelectionInput) {
        try {
          const { selection, generated } = await runSelectionAssistant();
          if (generated.missing.length) {
            setMessages((items) => [...items, { role: "assistant", text: `I read ${selection.items.length} item${selection.items.length === 1 ? "" : "s"}. To finish the selection/TDS, send: ${generated.missing.join("; ")}.` }]);
            return;
          }
          const additions: ChatUpload[] = [];
          if (generated.scheduleFile) additions.push({ file: generated.scheduleFile, sectionTitle: "Material schedule", kind: "support", documentText: `Selection Assistant material schedule: ${generated.models.join(", ")}` });
          if (generated.file) additions.push({ file: generated.file, sectionTitle: "Technical data sheet", kind: "support", documentText: `Selection Assistant technical data: ${generated.models.join(", ")}` });
          setSelectionArtifacts({ schedule: generated.scheduleFile, tds: generated.file, models: [...new Set(generated.models)] });
          setUploads((items) => [...items.filter((item) => !/^KINAIR-(?:Material-Schedule|Selector-TDS)/i.test(item.file.name)), ...additions]);
          setMessages((items) => [...items, { role: "assistant", text: `Selection completed for ${[...new Set(generated.models)].join(", ")}. I prepared the Material Schedule and TDS. Add project details and Send to build the Material Submittal automatically.` }]);
          return;
        } catch (selectionError) {
          setMessages((items) => [...items, { role: "assistant", text: selectionError instanceof Error ? `Selection Assistant needs more information: ${selectionError.message}` : "Selection Assistant could not complete the selection." }]);
          return;
        }
      }

      // Material submittal workflow is intentionally non-blocking.
      // Schedule + project details means "build the submittal"; missing cover fields/divider documents do not stop it.
      if (wantsSubmittal) {
        if (choseCustom && !hasCustomerIndex && !pastedCustomIndex) {
          setMessages((items) => [...items, { role: "assistant", text: "Please upload or paste the Custom Index you explicitly requested. Otherwise I can proceed with the General index." }]);
          return;
        }
      }
      const activeCatalog = modelCatalog.length ? modelCatalog : await loadSelectorModelCatalogue(tenantId);
      const clientFields = uniqueProjectDetails([
        ...coverDetailsText.split(/\r?\n/).flatMap(line => {
          const match = line.trim().match(/^([^:]{2,80})\s*:\s*(.+)$/);
          return match ? [{ label: match[1].trim(), value: match[2].trim() }] : [];
        }),
        ...parseClientProjectFields(text),
        ...requestMessages.filter((message) => message.role === "user").slice().reverse().flatMap((message) => parseClientProjectFields(message.text)),
        ...requestUploads.filter((upload) => upload.kind === "cover").flatMap((upload) => parseClientProjectFields(upload.documentText ?? upload.scheduleText ?? "")),
        ...parseClientProjectFields(sourceTextForMetadata),
      ]);
      const asksRevision = /\b(?:revise|revision|rev\.?\s*\d+|update\s+(?:the\s+)?(?:submittal|revision))\b/i.test(text);
      const fastLocalPlan = repairing && plan ? { ...plan, reply: "Recheck complete. Review the updated checklist below." } : wantsSubmittal && !asksRevision && !followUp && (clientFields.length > 0 || hasSelectionInput || hasCustomerIndex || hasProjectSpecification)
        ? {
            action: "create" as const,
            sourceRecordId: "",
            kind: submittalKind,
            title: clientFields.find((field) => /^project(?:\s+name)?$/i.test(field.label))?.value || `${submittalKind} Submittal`,
            coverHeading: "",
            brand: brands.find((name) => /^kinair$/i.test(name)) ?? "KINAIR",
            product: detectScheduleSeries(selectionText, seriesCatalogue, activeCatalog).series.join(", ") || inferMaterialTypes(selectionText).join(" & ") || "Fan",
            indexMode: (choseCustom ? "customer" : choseProject ? "project" : "general") as SubmittalChatPlan["indexMode"],
            fields: clientFields,
            sections: choseCustom && customSections.length ? customSections : pastedCustomIndex ? parsePastedIndexSections(text) : [],
            omitSections: [],
            reply: "Using the Selection Assistant result and the core Submittal Builder.",
          }
        : null;
      const recent = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const mentioned = recent.filter((r) => text.toLowerCase().includes(r.ref.toLowerCase()));
      const candidates = [...new Map([...mentioned, ...recent].slice(0, 150).map((r) => [r.id, r])).values()];
      let data: any;
      if (fastLocalPlan) {
        data = { plan: fastLocalPlan, provider: "local", model: "selection-core-fast-path" };
        setActiveProvider("KINAIR Selection Assistant + Core Builder · instant");
      } else {
        const result = await supabase.functions.invoke("submittal-assistant", {
          body: { message: text, forceReasoning: followUp, aiMode, documents: requestUploads.slice(0, 15).map((item) => ({ filename: item.file.name, section: item.sectionTitle, text: (item.scheduleText ?? item.documentText ?? "").slice(0, 6000) })), records: (isNewRequest ? [] : candidates).map((r) => ({ id: r.id, ref: r.ref, rev: r.rev, title: r.title, project: r.project, status: r.status })), brands, catalogueSeries: seriesCatalogue, verifiedSeries: detectScheduleSeries(requestUploads.map((upload) => upload.scheduleText ?? upload.documentText ?? "").join("\n"), seriesCatalogue, activeCatalog).series, scheduleExtracts: requestUploads.filter((upload) => upload.scheduleText).slice(0, 5).map((upload) => ({ filename: upload.file.name, text: upload.scheduleText!.slice(0, 4500) })), currentRecordId: isNewRequest ? undefined : currentRecordId, draftPlan: plan, history: requestMessages.slice(-6) },
        });
        if (result.error) {
          const context = "context" in result.error ? (result.error as { context?: Response }).context : undefined;
          const detail = context ? await context.json().catch(() => null) : null;
          throw new Error(detail?.error ?? result.error.message);
        }
        data = result.data;
      }
      if (!data?.plan || !["create", "revise", "clarify"].includes(data.plan.action)) throw new Error(data?.error ?? "No plan returned.");
      const autoIndexMode: SubmittalChatPlan["indexMode"] = choseCustom ? "customer" : choseProject ? "project" : "general";
      const projectTitle = (data.plan.fields ?? []).find((field: { label?: string; value?: string }) => /^project(?:\s+name)?$/i.test(String(field.label ?? "").trim()))?.value?.trim();
      const normalizedAiTitle = String(data.plan.title ?? "").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
      const nextPlan: SubmittalChatPlan | null = data.plan.action === "clarify" && !wantsSubmittal ? plan : { ...data.plan, action: data.plan.action === "clarify" ? "create" : data.plan.action, indexMode: data.plan.action === "revise" ? "keep" : autoIndexMode, title: projectTitle || normalizedAiTitle, coverHeading: data.plan.coverHeading || plan?.coverHeading || "" };
      if (nextPlan && isNewRequest) { nextPlan.action = "create"; nextPlan.sourceRecordId = ""; }
      if (nextPlan && nextPlan.action !== "revise") nextPlan.kind = submittalKind;
      if (nextPlan && indexChoice) {
        nextPlan.indexMode = indexChoice;
        nextPlan.explicitIndexMode = true;
        if (indexChoice === "customer" && customSections.length) nextPlan.sections = customSections;
      }
      if (nextPlan && companyOptions) {
        nextPlan.companyId = selectedCompanyId;
        nextPlan.brandId = selectedBrandId;
        nextPlan.brand = brandOptions?.find(item => item.id === selectedBrandId)?.name ?? "";
      }
      setPlan(nextPlan);
      setComposePending(false);
      const providerLabel = data.provider === "local" ? "KINAIR local engine" : data.provider && data.model ? `${data.provider === "openai" ? "OpenAI" : data.provider === "anthropic" ? "Claude" : "Gemini"} · ${availableModels.find((item) => item.model_id === data.model)?.display_name ?? data.model}` : "";
      setActiveProvider(Array.isArray(data.escalated) && data.escalated.length ? `Automatic escalated → ${providerLabel}` : providerLabel);
      let effectiveUploads = supportingUploadsSnapshot;
      const scheduleContent = requestUploads.filter((item) => item.sectionTitle === "Material schedule" || Boolean(item.selectionItems?.length))
        .map((item) => item.scheduleText ?? item.documentText ?? "").join("\n");
      // Any document already classified as Material Schedule goes through the
      // Selection Assistant. Do not require regex series detection first.
      if (nextPlan && hasSelectionInput) {
        const firstCheck = inspectPlan(nextPlan, supportingUploadsSnapshot, omitEmpty);
        const tdsSection = firstCheck.sectionStatus.find((item) => /technical data sheet|datasheet|tds/i.test(item.title));
        // Schedule selection is the source of truth for selector TDS generation.
        // Do not depend on the AI/index having already created a TDS divider:
        // generate first, then target the existing TDS heading or the standard heading.
        const tdsSectionTitle = tdsSection?.title ?? "Technical Data Sheet";
        const materialScheduleTitle = firstCheck.sectionStatus.find((item) => /material\s*schedule/i.test(item.title))?.title;
        const registrySeries = detectScheduleSeries(scheduleContent || selectionText, seriesCatalogue, activeCatalog).series;
        const liveSelectorSeries = registrySeries.filter((name) => isSelectorSeries(name, activeCatalog));
        const registeredDocumentSeries = registrySeries.filter((name) => !isSelectorSeries(name, activeCatalog));

        // Future/non-selector products use the TDS PDF registered under their
        // series. This is intentionally separate from the fan/air-curtain engine.
        if (registeredDocumentSeries.length && tdsSectionTitle) {
          const registeredTds = await loadRegisteredSeriesTds(tenantId, registeredDocumentSeries, activeCatalog);
          if (registeredTds.length) {
            const registryUploads: ChatUpload[] = registeredTds.map((file) => ({
              file,
              sectionTitle: tdsSectionTitle,
              kind: "support",
              documentText: `Registered series datasheet: ${registeredDocumentSeries.join(", ")}`,
            }));
            effectiveUploads = [
              ...effectiveUploads.filter((item) => !registryUploads.some((next) => next.file.name === item.file.name)),
              ...registryUploads,
            ];
            setUploads((items) => [
              ...items.filter((item) => !registryUploads.some((next) => next.file.name === item.file.name)),
              ...registryUploads,
            ]);
            setMessages((items) => [...items, {
              role: "assistant",
              text: `Loaded the saved series TDS for ${registeredDocumentSeries.join(", ")} from the shared product registry.`,
            }]);
          }
        }

        // If the registry says this is only AHU/FAHU/etc., do not send it into
        // the fan/air-curtain Selection Assistant. For fan/air-curtain rows, or
        // when no series is explicit yet, let the live selector determine it.
        const shouldGenerateTds = liveSelectorSeries.length > 0 || registeredDocumentSeries.length === 0;
        if (shouldGenerateTds) {
          try {
            const { selection, generated } = await runSelectionAssistant();

            // Selection Assistant is the authority for the exact series. Push its
            // resolved series back into the core Submittal Builder before saved
            // series documents are matched. Never collapse KVF-P/KVF-M/etc to
            // generic "Fan".
            const selectionAuthorityText = [
              ...selection.items.flatMap((item) => [item.series_name ?? "", item.existing_selection ?? ""]),
              ...generated.models,
            ].filter(Boolean).join("\n");
            const resolvedSeries = detectScheduleSeries(selectionAuthorityText, seriesCatalogue, activeCatalog).series;
            if (resolvedSeries.length) {
              nextPlan.product = resolvedSeries.join(", ");
              setPlan({ ...nextPlan });
            }

            currentTechnicalIssues = [...generated.missing];
            if (generated.missing.length) setMessages((items) => [...items, { role: "assistant", text: `Matching TDS needs review for: ${generated.missing.join("; ")}. Scheduled models and quantities are preserved; no substitutes were selected.` }]);
            const generatedUploads: ChatUpload[] = [];
            const hasOriginalMaterialSchedule = scheduleMode === "uploaded" && supportingUploadsSnapshot.some((item) =>
              item.sourceRole === "schedule" && !item.excludeFromPdf && /material\s*schedule/i.test(item.sectionTitle));
            if (!hasOriginalMaterialSchedule && generated.scheduleFile && materialScheduleTitle) generatedUploads.push({
              file: generated.scheduleFile,
              sectionTitle: materialScheduleTitle,
              kind: "support",
              documentText: `KINAIR validated Material Schedule: ${generated.models.join(", ")}`,
            });
            if (generated.file) generatedUploads.push({
              file: generated.file,
              sectionTitle: tdsSectionTitle,
              kind: "support",
              documentText: `KINAIR validated selector technical data: ${generated.models.join(", ")}`,
              selectionItems: selection.items,
              selectionProvider: selection.provider,
              selectionOptimizeFor: selection.optimizeFor,
            });
            if (generatedUploads.length) {
              // Keep a genuine customer Material Schedule exactly like the manual
              // builder. Replace only old/generated TDS pages. A clean generated
              // schedule is used only when the source was a quotation/offer.
              effectiveUploads = [
                ...effectiveUploads.filter((item) =>
                  !/^KINAIR-(?:Material-Schedule|Selector-TDS)/i.test(item.file.name)),
                ...generatedUploads,
              ];
              setUploads((items) => [
                ...items.filter((item) => !/^KINAIR-(?:Material-Schedule|Selector-TDS)/i.test(item.file.name)),
                ...generatedUploads,
              ]);
              setSelectionArtifacts({
                schedule: hasOriginalMaterialSchedule ? undefined : generated.scheduleFile,
                tds: generated.file,
                models: [...new Set(generated.models)],
              });
              const uniqueModels = [...new Set(generated.models)];
              const correctionText = generated.corrections.length
                ? ` Selection notes: ${generated.corrections.join("; ")}.`
                : "";
              setMessages((items) => [...items, { role: "assistant", text: `Read ${selection.items.length} scheduled row${selection.items.length === 1 ? "" : "s"}, preserved supplied models and arrangements, and generated matching TDS for ${uniqueModels.join(", ")}.${correctionText}` }]);
            }
          } catch (tdsError) {
            currentTechnicalIssues = [tdsError instanceof Error ? tdsError.message : "TDS generation failed"];
            setTdsWarnings(currentTechnicalIssues);
            setMessages((items) => [...items, {
              role: "assistant",
              text: `Selection Assistant could not generate the TDS: ${tdsError instanceof Error ? tdsError.message : "selection data was unavailable"}.`,
            }]);
          }
        }
      }
      let check = nextPlan && inspectPlan(nextPlan, effectiveUploads, omitEmpty);
      if (nextPlan && check?.unassignedFiles.length && aiMode !== "local") {
        const pending = effectiveUploads.map((item, index) => ({ item, index }))
          .filter(({ index }) => !check!.assignments[index]).slice(0, 15);
        if (pending.length) {
          setActiveProvider("AI checking unmatched document headings…");
          try {
            const result = await supabase.functions.invoke("submittal-assistant", { body: {
              action: "match_sections", message: "Cross-check unresolved document headings", aiMode,
              sections: check.sections.map(title => ({ title, intent: indexHeadingIntent(title) ?? "" })),
              documents: pending.map(({ item, index }) => ({ id: String(index), filename: item.file.name.slice(0,160),
                intent: indexHeadingIntent(item.sectionTitle) ?? "", text: (item.documentText ?? item.scheduleText ?? "").slice(0,6000) })),
            } });
            if (result.error) throw result.error;
            const updates = new Map<File, string>();
            for (const match of result.data?.matches ?? []) {
              const source = pending.find(({ index }) => String(index) === match.id);
              if (!source || !check.sections.includes(match.section) || match.confidence < .9 || updates.has(source.item.file)) continue;
              const evidence = String(match.evidence ?? "").trim();
              if (evidence.length < 8 || !(source.item.documentText ?? source.item.scheduleText ?? "").toLowerCase().includes(evidence.toLowerCase())) continue;
              updates.set(source.item.file, match.section);
            }
            if (updates.size) {
              const applyMatch = (item: ChatUpload) => updates.has(item.file) ? { ...item, sectionTitle: updates.get(item.file)! } : item;
              effectiveUploads = effectiveUploads.map(applyMatch);
              setUploads(items => items.map(applyMatch));
              setMessages(items => [...items, { role: "assistant", text: `AI matched ${updates.size} previously unmatched document(s): ${[...updates].map(([file,title]) => file.name + " → " + title).join("; ")}.` }]);
              check = inspectPlan(nextPlan, effectiveUploads, omitEmpty);
            }
            setActiveProvider((result.data?.providers ?? []).join(" → ") || "KINAIR local engine");
          } catch {
            setMessages(items => [...items, { role: "assistant", text: "AI cross-check was unavailable. Unmatched files remain available for manual divider selection." }]);
          }
        }
      }
      const technical = [...currentTechnicalIssues, ...(check?.unresolvedModels ?? []), ...(check?.unreadableSchedules ?? []), ...(check?.seriesConflicts ?? [])];
      if (nextPlan) { nextPlan.technicalIssues = [...new Set(technical)]; setPlan({ ...nextPlan }); }
      const blocking = check ? [...check.unassignedFiles, ...technical] : [];
      const missingSections = check?.sectionStatus.filter(section => !section.count).map(section => section.title) ?? [];
      const complete = Boolean(nextPlan && nextPlan.action !== "clarify" && check && !blocking.length && !missingSections.length);
      if (/\b(?:preview only|do not save|don't save|do not download|don't download)\b/i.test(text)) autoFinish.current = false;
      else if (!repairing && /\b(?:create|build|generate|download|final|finish)\b/i.test(question)) autoFinish.current = true;
      if (autoFinish.current && complete && nextPlan) {
        setMessages((items) => [...items, { role: "assistant", text: "Assembling the available sections. Any unresolved TDS items remain flagged for review below." }]);
        setApplying(true);
        try {
          const sourceUploads = requestUploads.filter((item) => item.kind === "cover" || item.kind === "index");
          const reply = await onApply(nextPlan, [...sourceUploads, ...effectiveUploads], omitEmpty, "pdf", confirmedCertificateMapping);
          setMessages((items) => [...items, { role: "assistant", text: reply }]);
          finishSubmittal();
        } catch (assembleError) {
          setMessages((items) => [...items, { role: "assistant", text: assembleError instanceof Error ? assembleError.message : String((assembleError as { message?: string })?.message ?? assembleError ?? "Could not assemble the PDF. Please review the files.") }]);
        } finally { setApplying(false); }
      } else {
        const guidance = (blocking.length ? `\nResolve these document/technical checks before final assembly: ${[...new Set(blocking)].join(", ")}.` : "") + (missingSections.length ? `\nPlease upload the missing documents for: ${missingSections.join(", ")}. You can upload them here and press Send, or open the manual builder to add them.` : "");
        setMessages((items) => [...items, { role: "assistant", text: `${data.plan.reply}${guidance}` }]);
      }
    } catch (error) {
      setComposePending(false);
      setMessages((items) => [...items, { role: "assistant", text: error instanceof Error ? `Could not prepare a draft: ${error.message}` : "Could not prepare a draft. Please try again." }]);
    } finally { setBusy(false); }
  };
  const apply = async (destination: "pdf" | "builder") => {
    if (destination === "pdf" && !ready) return;
    if (applying || busy || (destination === "pdf" && (!plan || !ready))) return;
    if (destination === "builder" && !plan && !uploads.length && submittalKind === "Material") {
      onOpenBuilder();
      return;
    }
    const draft: SubmittalChatPlan = plan ?? {
      action: "create", sourceRecordId: "", kind: submittalKind, title: `${submittalKind} Submittal`, coverHeading: "",
      brand: "", product: "", indexMode: "general", fields: [], sections: [], omitSections: [], reply: "",
    };
    if (companyOptions) {
      if (!companyOptions.some(item => item.id === selectedCompanyId) || !brandOptions?.some(item => item.id === selectedBrandId)) {
        setSetupOpen(true); setMessages(items => [...items, { role: "assistant", text: "Select the supplier company and brand in Project setup first." }]); return;
      }
      draft.companyId = selectedCompanyId; draft.brandId = selectedBrandId;
      draft.brand = brandOptions?.find(item => item.id === selectedBrandId)?.name ?? "";
    }
    setApplying(true);
    try {
      const reply = await onApply(draft, uploads.filter((item) => !item.excludeFromPdf), omitEmpty, destination, confirmedCertificateMapping);
      setMessages((items) => [...items, { role: "assistant", text: reply }]);
      finishSubmittal();
      if (destination === "builder") onOpenChange(false);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", text: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? "Could not save the draft.") }]);
    } finally { setApplying(false); }
  };
  const downloadSelectionFile = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = file.name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const replyProjectFields = (): Field[] => {
    const supplier=companyOptions?.find(item=>item.id===selectedCompanyId)?.name??scheduleBranding?.companyName??"";
    const brand=brandOptions?.find(item=>item.id===selectedBrandId)?.name??"";
    return normalizeCoverFields([
      ...parseClientProjectFields(coverDetailsText),
      ...(supplier?[{label:"Supplier Name",value:supplier}]:[]),
      ...(brand?[{label:"Brand Name",value:brand}]:[]),
    ]);
  };
  const prepareReplyWorkflow = async (kind:"compliance"|"rtcc", source:ChatUpload) => {
    setReplyWorkflowBusy(true);setReplyWorkflowProgress("");
    try{
      const fields=replyProjectFields();
      if(kind==="compliance"){
        const result=await readSpecification(source.file,setReplyWorkflowProgress);
        const sheet:ComplianceSheet={id:crypto.randomUUID(),title:"COMPLIANCE STATEMENT",sourceText:result.text,source:{id:"chat-source",name:source.file.name,type:source.file.type,size:source.file.size},sourceChecked:false,rows:result.rows,provider:"KINAIR specification parser"};
        setReplyWorkflow({kind:"compliance",sourceName:source.file.name,fields,sheet,excelImported:false});
        setMessages(items=>[...items,{role:"assistant",text:`Read ${result.rows.length} specification points from ${source.file.name}. The editable Compliance Excel is ready below. Download it, edit the Reply column, then upload the same Excel here to generate the branded PDF.`}]);
      }else{
        const result=await readConsultantComments(source.file,setReplyWorkflowProgress);
        const round:RtccRound={id:crypto.randomUUID(),number:1,date:new Date().toISOString(),sourceText:result.text,rows:result.rows,provider:"KINAIR RTCC parser"};
        setReplyWorkflow({kind:"rtcc",sourceName:source.file.name,fields,rounds:[round],excelImported:false});
        setMessages(items=>[...items,{role:"assistant",text:`Read ${result.rows.length} consultant comments from ${source.file.name}. The editable RTCC Excel is ready below. Download it, edit the Reply column, then upload the same Excel here to generate the branded PDF.`}]);
      }
      setComposePending(false);setPlan(null);
    }finally{setReplyWorkflowBusy(false);setReplyWorkflowProgress("");}
  };
  const downloadReplyExcel = async () => {
    if(!replyWorkflow)return;
    if(replyWorkflow.kind==="compliance")await downloadReviewExcel(complianceExportTables(replyWorkflow.sheet,replyWorkflow.fields,[]),"Compliance-Statement.xlsx");
    else await downloadReviewExcel(rtccExportTables(replyWorkflow.rounds,replyWorkflow.fields,[]),"Reply-to-Consultant-Comments.xlsx");
  };
  const importReplyExcel = async (file?:File) => {
    if(!file||!replyWorkflow)return;
    setReplyWorkflowBusy(true);setReplyWorkflowProgress("Reading completed Excel…");
    try{
      const sheets=await readReplyWorkbook(await file.arrayBuffer());
      const imported=sheets.find(sheet=>sheet.kind===replyWorkflow.kind);
      if(!imported)throw new Error(`This workbook does not contain a ${replyWorkflow.kind==="compliance"?"Compliance":"RTCC"} reply sheet.`);
      if(replyWorkflow.kind==="compliance"){
        const changes=matchImportedReplies(imported.rows,replyWorkflow.sheet.rows.filter(r=>r.included).map(r=>({...r,number:r.clause,comment:specificationBody(r)})));
        setReplyWorkflow({...replyWorkflow,excelImported:true,sheet:{...replyWorkflow.sheet,rows:replyWorkflow.sheet.rows.map(r=>{const change=changes.find(item=>item.id===r.id);return change?{...r,reply:change.reply,reviewed:false}:r;})}});
      }else{
        const round=replyWorkflow.rounds[0];
        if(!round)throw new Error("Create the RTCC Excel first.");
        const changes=matchImportedReplies(imported.rows,round.rows.map((r,i)=>({...r,number:r.sourceNumber||String(i+1),comment:rtccCommentBody(r)})));
        setReplyWorkflow({...replyWorkflow,excelImported:true,rounds:[{...round,rows:round.rows.map(r=>{const change=changes.find(item=>item.id===r.id);return change?{...r,reply:change.reply,reviewed:false}:r;})}]});
      }
      setMessages(items=>[...items,{role:"assistant",text:"Completed Excel read successfully. The replies are loaded. You can now generate the branded PDF with the selected company/brand logos and company stamp."}]);
    }finally{setReplyWorkflowBusy(false);setReplyWorkflowProgress("");if(replyExcelInputRef.current)replyExcelInputRef.current.value="";}
  };
  const downloadReplyPdf = async () => {
    if(!replyWorkflow)return;
    if(!selectedCompanyId||!selectedBrandId)throw new Error("Select the company and brand in Project setup before generating the PDF.");
    setReplyWorkflowBusy(true);setReplyWorkflowProgress("Generating branded PDF…");
    try{
      const branding={companyLogo:scheduleBranding?.companyLogo,brandLogo:scheduleBranding?.brandLogo,stamp:scheduleBranding?.stamp};
      const fields=replyProjectFields();
      const bytes=replyWorkflow.kind==="compliance"
        ? await buildCompliancePdf(replyWorkflow.sheet,fields,{},branding)
        : await buildReviewPdf(rtccExportTables(replyWorkflow.rounds,fields,[]),branding);
      const name=replyWorkflow.kind==="compliance"?"Compliance-Statement.pdf":"Reply-to-Consultant-Comments.pdf";
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}));
      const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessages(items=>[...items,{role:"assistant",text:`${name} generated using the same builder PDF format and the selected company/brand branding.`}]);
    }finally{setReplyWorkflowBusy(false);setReplyWorkflowProgress("");}
  };

  const prepareUploadsForSend = async (): Promise<ChatUpload[]> => {
    // A prior timeout is retryable; do not permanently skip the attachment.
    const pending = uploads.filter((item) => !item.scheduleText && !item.documentText);
    if (!pending.length) return uploads;

    setReadingUploads(pending.length);
    try {
      const activeCatalog = modelCatalog.length ? modelCatalog : await loadSelectorModelCatalogue(tenantId);
      const readOne = async (pendingItem: ChatUpload) => {
        const file = pendingItem.file;
        const mobileFast = typeof window !== "undefined" && (window.matchMedia?.("(max-width: 768px)")?.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
        const selectionSummary = (items: AssistantScheduleItem[]) => items.map((item, index) => [
          item.tag || `Item ${index + 1}`,
          item.product,
          item.series_name || "",
          item.existing_selection || "",
          item.airflow != null ? `${item.airflow} ${item.airflow_unit || "CMH"}` : "",
          item.static_pressure != null ? `${item.static_pressure} ${item.pressure_unit || "Pa"}` : "",
          item.door_width != null ? `width ${item.door_width} ${item.door_width_unit || "mm"}` : "",
          item.door_height != null ? `height ${item.door_height} ${item.door_height_unit || "m"}` : "",
        ].filter(Boolean).join(" | ")).join("\n");

        try {
          let readResult: { text: string; methods: string[]; warnings: string[]; directProvider?: string };
          const setupPurpose = uploads.find(upload => upload.file === file)?.uploadPurpose;
          if ((setupPurpose === "Cover" || setupPurpose === "Customer index") && /\.(pdf|txt|png|jpe?g)$/i.test(file.name)) {
            readResult = { text: await extractSetupText(file, readScannedPage), methods: ["Structured cover/index reading"], warnings: [] };
          } else if (/\.docx$/i.test(file.name)) {
            readResult = { text: await readWordInquiry(file), methods: ["Word document text and tables"], warnings: [] };
          } else if (isSpreadsheet(file)) {
            readResult = { text: await spreadsheetToText(file, 500), methods: ["spreadsheet cells"], warnings: [] };
          } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
            // Most schedules are searchable PDFs. Use the text layer first and
            // avoid OCR/whole-file vision unless the text layer is genuinely poor.
            let fastText = "";
            try {
              fastText = await Promise.race([
                pdfToText(file, mobileFast ? 10 : 15),
                new Promise<string>((resolve) => window.setTimeout(() => resolve(""), mobileFast ? 5500 : 8500)),
              ]);
            } catch { fastText = ""; }
            if (fastText.replace(/[^a-z0-9]/gi, "").length >= 120) {
              readResult = { text: fastText, methods: ["PDF text layer"], warnings: [] };
            } else {
              readResult = await Promise.race([
                extractTextAdvanced(file, readScannedPage, { mobileFast, directAi: true, firstReadable: true }),
                new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Document reading timed out.")), 90000)),
              ]);
            }
          } else {
            readResult = await Promise.race([
              extractTextAdvanced(file, readScannedPage, { mobileFast, directAi: true, firstReadable: true }),
              new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Document reading timed out.")), 90000)),
            ]);
          }

          const extractedRaw = readResult.text.slice(0, 40000);
          if (!extractedRaw.trim()) throw new Error("No readable text found.");
          const extracted = extractedRaw; // Preserve printed model codes; never autocorrect a schedule.
          const purpose = uploads.find(upload => upload.file === file)?.uploadPurpose;
          if (purpose && purpose !== "Quotation") return { file, patch: {
            kind: purpose === "Cover" ? "cover" as const : purpose === "Customer index" ? "index" as const : "support" as const,
            sectionTitle: purpose, documentText: extracted, scheduleError: undefined,
            readMethods: readResult.methods, readWarnings: readResult.warnings,
          } };
          const quotation = isQuotationText(extracted);
          const detected = classifyUpload(file, extracted);
          if (detected.kind === "support" && !detected.isSchedule && /\.txt$/i.test(file.name)) throw new Error("Save supporting TXT documents as PDF before building the final submittal.");

          let selectionProbe = null;
          // Known schedules do not need a separate classification call here;
          // the single Selection Assistant call later generates the TDS. Unknown
          // technical files get one content-only probe so any filename still works.
          if (!detected.isSchedule && detected.kind === "support" && !detected.sectionTitle) {
            try {
              selectionProbe = await Promise.race([
                probeSelectionAssistantSchedule(extracted, aiMode),
                new Promise<null>((resolve) => window.setTimeout(() => resolve(null), mobileFast ? 9000 : 14000)),
              ]);
            } catch { selectionProbe = null; }
          }

          const isSelectionSource = purpose === "Quotation" || quotation || Boolean(selectionProbe?.items.length) || detected.isSchedule;
          const sourceRole: ChatUpload["sourceRole"] | undefined = isSelectionSource ? (quotation ? "quotation" : "schedule") : undefined;
          // The PDF assembler accepts PDF/images only. Spreadsheets and text
          // feed selection, which generates a printable material schedule.
          const printableSource = /\.(pdf|png|jpe?g)$/i.test(file.name) || ["application/pdf", "image/png", "image/jpeg"].includes(file.type);
          const keepOriginalSchedule = isSelectionSource && !quotation && printableSource && scheduleMode === "uploaded";
          return {
            file,
            patch: {
              kind: isSelectionSource ? "support" : detected.kind,
              sectionTitle: keepOriginalSchedule ? "Material schedule" : (isSelectionSource ? "" : detected.sectionTitle),
              sourceRole,
              excludeFromPdf: Boolean(isSelectionSource && !keepOriginalSchedule),
              readMethods: readResult.methods,
              readWarnings: readResult.warnings,
              directReadProvider: readResult.directProvider,
              ...(isSelectionSource ? {
                scheduleText: extracted,
                documentText: undefined,
                selectionItems: selectionProbe?.items,
                selectionProvider: selectionProbe?.provider,
                selectionOptimizeFor: selectionProbe?.optimizeFor,
                scheduleError: undefined,
              } : { documentText: extracted, scheduleText: undefined, scheduleError: undefined }),
            } satisfies Partial<ChatUpload>,
          };
        } catch (readError) {
          if (pendingItem.uploadPurpose && !["Quotation", "Cover", "Customer index"].includes(pendingItem.uploadPurpose)) {
            return { file, patch: { kind: "support", sectionTitle: pendingItem.uploadPurpose, excludeFromPdf: false,
              scheduleError: undefined, readWarnings: ["Text could not be read; the original document is included under your selected divider."] } satisfies Partial<ChatUpload> };
          }
          // Last-resort path for scanned/problem PDFs: let the actual Selection
          // Assistant read the attachment. If it finds rows, that result is enough
          // to classify the file as Material Schedule and generate TDS.
          try {
            const selection = await Promise.race([
              readSelectionAssistantAttachment(
                file,
                "Read every real fan/air-curtain schedule row. Preserve tag, quantity, units, exact selected model and duty. Ignore commercial terms.",
                aiMode,
              ),
              new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Selection Assistant timed out.")), 150000)),
            ]);
            if (!selection.items.length) throw new Error("No schedule rows found.");
            const summary = selectionSummary(selection.items);
            const preserveOriginal = pendingItem.uploadPurpose !== "Quotation" && scheduleMode === "uploaded" && /\.(pdf|png|jpe?g)$/i.test(file.name);
            return {
              file,
              patch: {
                kind: "support",
                sectionTitle: preserveOriginal ? "Material schedule" : "",
                sourceRole: pendingItem.uploadPurpose === "Quotation" ? "quotation" : "schedule",
                excludeFromPdf: !preserveOriginal,
                scheduleText: summary || "Selection Assistant identified this file as a material schedule.",
                documentText: undefined,
                selectionItems: selection.items,
                selectionProvider: selection.provider,
                selectionOptimizeFor: selection.optimizeFor,
                scheduleError: undefined,
                readMethods: ["Selection Assistant attachment reader"],
                readWarnings: readError instanceof Error ? [readError.message] : [],
              } satisfies Partial<ChatUpload>,
            };
          } catch {
            const scheduleLike = /\bschedule\b/i.test(file.name);
            return {
              file,
              patch: {
                sectionTitle: scheduleLike ? "Material schedule" : pendingItem.sectionTitle,
                excludeFromPdf: pendingItem.uploadPurpose === "Quotation" || !/\.(pdf|png|jpe?g)$/i.test(file.name),
                sourceRole: pendingItem.uploadPurpose === "Quotation" ? "quotation" : scheduleLike ? "schedule" : undefined,
                scheduleError: readError instanceof Error ? readError.message : "Could not read this file.",
              } satisfies Partial<ChatUpload>,
            };
          }
        }
      };
      const results: Awaited<ReturnType<typeof readOne>>[] = [];
      const concurrency = mobileMode ? 2 : 3;
      for (let offset = 0; offset < pending.length; offset += concurrency) {
        results.push(...await Promise.all(pending.slice(offset, offset + concurrency).map(readOne)));
      }
      const prepared = uploads.map((item) => {
        const hit = results.find((result) => result.file === item.file);
        if (!hit) return item;
        const preparedItem = { ...item, ...hit.patch };
        if (item.uploadPurpose && item.uploadPurpose !== "Quotation") {
          preparedItem.kind = item.uploadPurpose === "Cover" ? "cover" : item.uploadPurpose === "Customer index" ? "index" : "support";
          preparedItem.sectionTitle = item.uploadPurpose;
          preparedItem.documentText = hit.patch.documentText ?? hit.patch.scheduleText;
          preparedItem.scheduleText = undefined;
          preparedItem.selectionItems = undefined;
          preparedItem.sourceRole = undefined;
          preparedItem.excludeFromPdf = false;
        }
        return preparedItem;
      });
      setUploads(prepared);
      return prepared;
    } finally {
      setReadingUploads(0);
    }
  };

  const addFiles = (files: File[], purpose?: string) => {
    const supported = files.filter((file) => /\.(pdf|png|jpe?g|txt|docx|xlsx|xlsm|xls|csv)$/i.test(file.name) || ["application/pdf", "image/png", "image/jpeg", "text/plain", "text/csv"].includes(file.type));
    if (supported.length !== files.length) setMessages((items) => [...items, { role: "assistant", text: "Upload PDF, PNG, JPG, DOCX, Excel/CSV or TXT. Older DOC files must be saved as DOCX or PDF." }]);
    if (!supported.length) return;
    if (completed) {
      if (onRestart) {
        onRestart({ input, coverDetailsText, customIndexText, indexChoice, submittalKind, workflowChoice, scheduleMode,
          uploads: supported.map(file => ({ file, sectionTitle: purpose ?? "", kind: purpose === "Cover" ? "cover" : purpose === "Customer index" ? "index" : "support", uploadPurpose: purpose, excludeFromPdf: purpose === "Quotation" })) });
        return;
      }
      startNewSubmittal();
      // Users may enter the next project's details before attaching its files.
      setCoverDetailsText(coverDetailsText); setCustomIndexText(customIndexText); setIndexChoice(indexChoice); setSubmittalKind(submittalKind); setWorkflowChoice(workflowChoice); setScheduleMode(scheduleMode);
      setInput(input);
    }
    setConfirmedCertificateMapping(false);
    // A new attachment batch starts a fresh compose cycle. Hide/clear the old
    // checklist so it cannot look like the new file has already been analysed.
    setComposePending(true);
    setPlan(null);
    setSelectionArtifacts(null);
    // Attach only. OCR / classification / Selection Assistant starts after the user presses Send.
    setUploads((current) => [...current, ...supported.map((file) => ({ file, sectionTitle: purpose ?? "", kind: purpose === "Cover" ? "cover" as const : purpose === "Customer index" ? "index" as const : "support" as const, uploadPurpose: purpose, excludeFromPdf: purpose === "Quotation" }))]);
  };
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl" style={visualViewport ? { height: `${visualViewport.height}px`, top: `${visualViewport.top}px`, bottom: "auto" } : undefined}>
          <input ref={targetedUploadRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.docx,.xlsx,.xlsm,.xls,.csv" className="sr-only" aria-label="Upload index-specific documents" onChange={event => { addFiles(Array.from(event.target.files ?? []), uploadTarget.current); event.target.value = ""; }} />
          <input ref={coverUploadRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" aria-label="Select cover page" onChange={event => { addFiles(Array.from(event.target.files ?? []), "Cover"); event.target.value = ""; }} />
      <SheetHeader className="border-b border-border px-4 py-3 pr-12"><SheetTitle className="flex items-center gap-2 text-base"><Sparkles className="size-5 text-primary" /> KINAIR Submittal AI</SheetTitle><Button type="button" variant="outline" size="sm" className="mt-2 w-fit" disabled={!completed && (busy || applying || !!readingUploads)} onClick={startNewSubmittal}>New submittal</Button>{onOpenRtcc && <Button type="button" variant="outline" size="sm" className="mt-2 ml-2" disabled={busy || applying || !!readingUploads} onClick={onOpenRtcc}>Consultant comments / RTCC</Button>}{onOpenCompliance && <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy || applying || !!readingUploads} onClick={onOpenCompliance}>Specification compliance & library</Button>}</SheetHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-5">
        {completed && <div role="status" className="rounded-xl border bg-secondary p-3 text-sm">Submittal saved. Choose <button type="button" className="font-semibold underline" onClick={startNewSubmittal}>New submittal</button> or upload files below to start another project.</div>}
        {!messages.length && <div className="rounded-2xl bg-secondary p-4 text-sm">
          <p className="font-semibold">Hi, I'm KINAIR Submittal AI.</p>
          <p className="mt-1 text-muted-foreground">Material Submittal is the default. Choose Compliance Statement or RTCC only when you want those workflows. You may also type the workflow name; typing is otherwise optional.</p>
        </div>}
        <details open={setupOpen} onToggle={event => setSetupOpen(event.currentTarget.open)} className="rounded-xl border bg-background">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Project setup · Type, index &amp; cover details</summary>
        <div className="space-y-3 border-t p-3">
          {companyOptions && <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Supplier company
              <select aria-label="Chat supplier company" value={selectedCompanyId ?? ""} disabled={busy || applying} className="mt-1 w-full rounded-md border bg-background p-2 text-base" onChange={event => { onCompanyChange?.(event.target.value); setPlan(null); setComposePending(true); }}>
                <option value="">Select company</option>{companyOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Brand
              <select aria-label="Chat brand" value={selectedBrandId ?? ""} disabled={busy || applying} className="mt-1 w-full rounded-md border bg-background p-2 text-base" onChange={event => { onBrandChange?.(event.target.value); setPlan(null); setComposePending(true); }}>
                <option value="">Select brand</option>{brandOptions?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2">Your selection controls the company and brand documents, logos and supplier details. Company certificates apply across the selected company's products.</p>
          </div>}
          <label className="block text-sm font-semibold">What do you want to prepare? <span className="font-normal text-muted-foreground">(Default: Material Submittal)</span>
            <select aria-label="Document workflow" value={workflowChoice} disabled={busy || applying || replyWorkflowBusy} className="mt-1 w-full rounded-md border bg-background p-2 text-base sm:text-sm" onChange={event => {
              const value=event.target.value as ChatWorkflowChoice;setWorkflowChoice(value);setReplyWorkflow(null);setPlan(null);
              if(value==="Material"||value==="PQ"||value==="O&M")setSubmittalKind(value);
              setComposePending(uploads.length>0);
            }}>
              <option value="Material">Material Submittal — Default</option>
              <option value="PQ">PQ Submittal</option>
              <option value="O&M">O&amp;M Submittal</option>
              <option value="Compliance">Compliance Statement</option>
              <option value="RTCC">RTCC - Reply to Consultant Comments</option>
            </select>
          </label>
          {workflowChoice === "Material" && <label className="block text-sm font-semibold">Material schedule
            <select aria-label="Material schedule source" value={scheduleMode} disabled={busy || applying || !!readingUploads} className="mt-1 w-full rounded-md border bg-background p-2 text-base sm:text-sm" onChange={event => {
              setScheduleMode(event.target.value as "uploaded" | "ai"); setPlan(null); setComposePending(true);
              setUploads(items => items.map(item => ({ ...item, scheduleText: undefined, documentText: undefined, selectionItems: undefined })));
            }}>
              <option value="uploaded">Use customer-provided schedule</option>
              <option value="ai">Prepare schedule with AI / inquiry</option>
            </select>
            <span className="mt-2 block text-xs font-normal text-muted-foreground">Unpriced PDF/image schedules stay as supplied. Inquiries, priced quotations and AI mode produce a new schedule. Word/Excel schedules are converted to PDF.</span>
          </label>}
          {(workflowChoice==="Material"||workflowChoice==="PQ"||workflowChoice==="O&M")&&<label className="block text-sm font-semibold">Submittal index
            <select aria-label="Submittal index type" value={indexChoice ?? "general"} disabled={busy || applying} className="mt-1 w-full rounded-md border bg-background p-2 text-base sm:text-sm" onChange={event => { setIndexChoice(event.target.value as "general" | "project" | "customer"); setPlan(null); setComposePending(true); }}>
              <option value="general">General specification — no client index</option>
              <option value="project">Project specification — no client index</option>
              <option value="customer">Project specification — custom client index</option>
            </select>
          </label>}
          {(workflowChoice==="Material"||workflowChoice==="PQ"||workflowChoice==="O&M")&&(indexChoice ?? "general") === "general" && <p className="text-xs text-muted-foreground">No client index supplied. Uses your saved General Specification index.</p>}
          {(workflowChoice==="Material"||workflowChoice==="PQ"||workflowChoice==="O&M")&&indexChoice === "project" && <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No client index supplied. Uses your saved Project Specification index. Attach the project specification and its compliance statement.</p>
            {(["Project Specification", "Compliance Statement"] as const).map(purpose => <Button key={purpose} type="button" variant="outline" className="w-full justify-start whitespace-normal text-left" disabled={busy || applying} onClick={() => { uploadTarget.current = purpose; targetedUploadRef.current?.click(); }}><FileUp className="size-4 shrink-0" /> Upload {purpose}</Button>)}
          </div>}
          {(workflowChoice==="Material"||workflowChoice==="PQ"||workflowChoice==="O&M")&&indexChoice === "customer" && <div className="space-y-2">
            <label className="block text-xs font-medium">Paste your custom index
              <textarea aria-label="Custom index headings" rows={4} value={customIndexText} disabled={busy || applying} className="mt-1 w-full rounded-md border bg-background p-2 text-base sm:text-sm" placeholder={"1. Company profile\n2. Material schedule\n3. Technical data sheet"} onChange={event => { setCustomIndexText(event.target.value); setPlan(null); setComposePending(true); }} />
            </label>
            <p className="text-xs text-muted-foreground">Use the client's exact headings and order. Paste one heading per line or upload the client's index. Missing documents can be uploaded against each divider.</p>
            <Button type="button" variant="outline" className="w-full" disabled={busy || applying} onClick={() => { uploadTarget.current = "Customer index"; targetedUploadRef.current?.click(); }}><FileUp className="size-4" /> Upload Custom Index</Button>
          </div>}
        </div>
        <div className="space-y-2 rounded-xl border bg-background p-3">
          <p className="text-sm font-semibold">Cover / project details</p>
          <ProjectDetailsReuse records={records} disabled={busy || applying || !!readingUploads || uploads.some(u=>u.kind === "cover")} onApply={fields=>{setCoverDetailsText(fields.map(f=>`${f.label}: ${f.value}`).join("\n"));setPlan(null);setComposePending(true);}}/>
          <label className="block text-xs font-medium">Paste client project details
            <textarea aria-label="Cover project details" rows={5} value={coverDetailsText} disabled={busy || applying} className="mt-1 w-full rounded-md border bg-background p-2 text-base sm:text-sm" placeholder={"Project Name: Warehouse in Al Quoz\nClient: ...\nConsultant: ...\nMain Contractor: ...\nMEP Contractor: ..."} onChange={event => { setCoverDetailsText(event.target.value); setPlan(null); setComposePending(true); }} />
          </label>
          <p className="text-xs text-muted-foreground">Keep the client's field labels and wording. Paste the details above or upload a cover page (PDF/image). Files are read after Send; an uploaded cover keeps its original layout.</p>
          <Button type="button" variant="outline" className="w-full" disabled={busy || applying} onClick={() => coverUploadRef.current?.click()}><FileUp className="size-4" /> Upload Cover / Project Details</Button>
        </div>
        </details>
        <details className="rounded-lg border bg-background px-3 py-2"><summary className="cursor-pointer text-xs text-muted-foreground">AI settings · Automatic by default</summary>
        <label className="mt-2 block text-xs font-semibold text-muted-foreground">AI provider
          <select aria-label="Submittal AI provider" value={aiMode} onChange={(event) => setAiMode(event.target.value as typeof aiMode)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground">
            <option value="auto">Automatic · Local → Free → Cheap → Balanced → Premium</option>
            <option value="local">KINAIR local engine</option>
            {(dynamicModelOptions.length ? dynamicModelOptions : fallbackAiModelOptions).map((model) => <option key={model.mode} value={model.mode}>{model.label}</option>)}
          </select>
        </label>
        </details>
        {activeProvider && <p className="text-xs text-muted-foreground">Response from {activeProvider}</p>}
        {messages.map((message, i) => <div key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}>{message.text}</div>)}
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Preparing draft…</p>}
        {plan && !composePending && <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-bold">{plan.action === "revise" ? "Final PDF from a new revision" : "Final submittal PDF"}</p>
          {plan.action === "revise" && <p className="mt-1 text-xs text-muted-foreground">Source: {records.find((record) => record.id === plan.sourceRecordId)?.ref ?? "Unknown"} Rev {records.find((record) => record.id === plan.sourceRecordId)?.rev ?? "?"}</p>}
          <label className="mt-2 block text-xs font-semibold">Submittal title
            <input aria-label="Chat submittal title" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={plan.title} onChange={(event) => setPlan((current) => current ? { ...current, title: event.target.value } : current)} />
          </label>
          <label className="mt-2 block text-xs font-semibold">PDF cover heading
            <input aria-label="Chat PDF cover heading" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={plan.coverHeading ?? ""} onChange={(event) => setPlan((current) => current ? { ...current, coverHeading: event.target.value } : current)} placeholder={plan.kind === "Material" ? `Material Submittal for ${plannedTypes.join(" & ") || seriesProductType(plan.product || "", modelCatalog) || plan.product || "Fan"}` : "Submittal"} />
          </label>
          {plan.brand && <p>Brand: {plan.brand}</p>}
          {plan.product && <p>Product: {plannedTypes.length ? plannedTypes.join(", ") : plan.product}</p>}
          {!!plannedSeries.length && <p>Series: {plannedSeries.join(", ")}</p>}
          {!review?.detectedSeries.length && !!supportingUploads.length && <label className="mt-2 block text-xs font-semibold">
            Series shown on your schedule or TDS
            <select aria-label="Confirm product series from PDF" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={plan.confirmedSeries ?? ""} onChange={(event) => setPlan((current) => current ? { ...current, product: event.target.value, confirmedSeries: event.target.value } : current)}>
              <option value="">Select the exact series if AI could not read it</option>
              {[...new Set(seriesCatalogue.filter((name) => seriesProductType(name, modelCatalog)))].map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>}
          {!!plan.confirmedSeries && <p className="text-emerald-700">Series confirmed by you: {plan.confirmedSeries}</p>}
          {plan.fields.length > 0 && <dl className="mt-3 overflow-hidden rounded-lg border bg-background">{normalizeCoverFields(plan.fields).map(field => <div key={field.label} className="grid grid-cols-[38%_minmax(0,1fr)] border-b last:border-0"><dt className="bg-secondary px-3 py-2 text-xs font-semibold break-words">{field.label}</dt><dd className="px-3 py-2 text-xs break-words">{field.value}</dd></div>)}</dl>}
          <p className="mt-2">Index: {review?.indexMode === "keep" ? "Keep previous" : (review?.indexMode ?? plan.indexMode) === "general" ? "General specification — no client index" : (review?.indexMode ?? plan.indexMode) === "project" ? "Project specification — no client index" : "Project specification — custom client index"} · {review?.sectionStatus.length ?? 0} sections</p>
          {plan.brand && !brands.some((brand) => brand.toLowerCase() === plan.brand.toLowerCase()) && <p className="mt-2 text-xs font-medium text-amber-700">This brand is not in your saved document library. Upload its certificates and catalogues here, or add them in the builder.</p>}
          {!!plan.omitSections?.length && <p className="mt-2 text-xs">Excluded by request: {plan.omitSections.join(", ")}</p>}
          {review && <div className="mt-3 space-y-2 rounded-xl bg-background p-3">
            <p className="font-semibold">Index checklist · {review.sectionStatus.filter((section) => section.count > 0).length} of {review.sectionStatus.length} sections included</p>
            <ol className="space-y-2 rounded-lg border p-2 text-xs">
              {review.sectionStatus.map((section, index) => <li key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <span>{index + 1}. {section.title}</span>
                <div className="flex flex-col items-end gap-1">
                  <span className={section.count ? "text-emerald-700" : "text-amber-700"}>{section.count ? `Included · ${section.count}` : "Upload required"}</span>
                  {!section.count && <Button type="button" variant="outline" size="sm" disabled={busy || applying || !!readingUploads} aria-label={`Upload ${section.title}`} onClick={() => { uploadTarget.current = section.title; targetedUploadRef.current?.click(); }}><FileUp className="size-4" /> Upload</Button>}
                </div>
              </li>)}
            </ol>
            <Button type="button" variant="outline" size="sm" disabled={busy || applying || !!readingUploads} onClick={() => void ask("Recheck missing documents and retry missing TDS")}>Recheck missing documents</Button>
            <p className="text-xs text-muted-foreground">Each Upload button assigns files to that exact divider. Attach missing files, then press Send. Or use the manual builder below.</p>
            {!!review.detectedSeries.length && <p className="text-emerald-700">Series found in uploaded files: {review.detectedSeries.join(", ")}. Related saved series documents will be used where available.</p>}
            {!!review.unresolvedModels.length && <p className="text-amber-700">Unverified schedule code(s): {review.unresolvedModels.join(", ")}. Please confirm the exact series; I will not attach a guessed TDS.</p>}
            {!!review.unreadableSchedules.length && <p className="text-amber-700">Schedule text is unreadable or still loading: {review.unreadableSchedules.join(", ")}.</p>}
            {!!review.undetectedSchedules.length && <p className="text-amber-700">No verified series found in: {review.undetectedSchedules.join(", ")}. Check the text read below or choose the exact series above.</p>}
            {!!review.seriesConflicts.length && <p className="text-amber-700">Schedule and TDS show different series: {review.seriesConflicts.join("; ")}. Check which documents belong to this submittal.</p>}
            {!!review.missingCover.length && <p className="text-muted-foreground">Not provided by client and left blank: {review.missingCover.join(", ")}.</p>}
            {!!review.missingDocuments.length && <p className="text-muted-foreground">Upload missing documents: {review.missingDocuments.join(", ")}, or open the manual builder below.</p>}
            {!!review.excludedCertificates.length && <p className="text-amber-700">Saved test certificate not added because its exact series is not identified: {review.excludedCertificates.join(", ")}. Upload the matching certificate if required by this index.</p>}
            {!!review.unassignedFiles.length && <p className="text-amber-700">Choose a divider for: {review.unassignedFiles.join(", ")}.</p>}
            {!review.attachedCount && <p className="text-muted-foreground">Upload supporting documents here, or add them in the manual builder.</p>}
            {ready && <p className="text-emerald-700">Ready to assemble with the existing submittal builder.</p>}
          </div>}
          {!!review?.emptyCount && <p className="mt-2 text-xs text-muted-foreground">{review.emptyCount} section(s) need documents before chat can generate the final PDF.</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button onClick={() => void apply("pdf")} disabled={applying || !ready}>{applying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {applying ? "Uploading and saving…" : "Create & download final PDF"}</Button><Button variant="outline" disabled={applying || !!readingUploads} onClick={() => void apply("builder")}>Open manual builder</Button><Button variant="ghost" onClick={() => { setPlan(null); setUploads([]); setOmitEmpty(false); setConfirmedCertificateMapping(false); autoFinish.current = true; }}><X className="size-4" /> Discard</Button></div>
          <p className="mt-2 text-xs text-muted-foreground">The saved draft remains editable in the builder. Downloading the PDF does not mark it as sent to the customer.</p>
        </div>}
      <div className="rounded-xl border border-border p-3">
        {(workflowChoice==="Compliance"||workflowChoice==="RTCC")&&<div className="mb-3 rounded-lg bg-primary/5 p-3 text-sm"><p className="font-semibold">{workflowChoice==="Compliance"?"Upload Project Specification":"Upload Consultant Comments"}</p><p className="text-xs text-muted-foreground">No message is required. Upload the source file and press Send; KINAIR will create the editable {workflowChoice==="Compliance"?"Compliance":"RTCC"} Excel using the same builder engine.</p></div>}
        {(workflowChoice==="Material"||workflowChoice==="PQ"||workflowChoice==="O&M")&&<label className={`relative flex min-h-12 w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-3 text-sm font-medium ${busy || applying || !!readingUploads ? "opacity-50" : "cursor-pointer"}`}>
          <FileUp className="size-4" /> Upload quotation / priced schedule
          <input key={completed ? "completed-quotation" : "compose-quotation"} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.docx,.xlsx,.xlsm,.xls,.csv" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Upload quotation / priced schedule" disabled={busy || applying || !!readingUploads} onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; addFiles(files, "Quotation"); }} />
        </label>}
        {(workflowChoice==="Material"||workflowChoice==="PQ"||workflowChoice==="O&M")&&<p className="text-xs text-muted-foreground">Priced originals are excluded from the PDF and converted to a clean technical schedule. Without prices, your uploaded schedule is kept unless you select AI preparation.</p>}
        <label className={`relative flex min-h-12 w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-3 text-sm font-medium ${applying || busy ? "opacity-50" : "cursor-pointer"}`}>
          <FileUp className="size-4" /> {workflowChoice==="Compliance"?"Upload Project Specification":workflowChoice==="RTCC"?"Upload Consultant Comments":"Upload files"}
          <input key={completed ? "completed-files" : "compose-files"} ref={uploadInputRef} type="file" multiple={workflowChoice!=="Compliance"&&workflowChoice!=="RTCC"} accept=".pdf,.png,.jpg,.jpeg,.txt,.docx,.xlsx,.xlsm,.xls,.csv" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Upload files" disabled={applying || busy} onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; addFiles(files); }} />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{workflowChoice==="Compliance"?"PDF, scanned PDF, image, Word or Excel specification supported.":workflowChoice==="RTCC"?"Upload the consultant comment PDF or image.":"Cover, index, schedule, datasheets and certificates: upload together. I'll read and sort them."}</p>
        {!!uploads.length && <div className="mt-2 space-y-2">
          <p className="text-xs font-semibold">{uploads.length} file(s) attached. {readingUploads ? (mobileMode ? "Reading document securely on server…" : "Reading/OCR and identifying document type…") : "Add your message, then press Send."}</p>
          {uploads.map((upload, index) => <div key={index}><div className="flex items-center gap-2 rounded-lg bg-secondary p-2 text-xs">
            <span className="min-w-0 flex-1 truncate" title={upload.file.name}>{upload.file.name}</span>
            {composePending ? <span className="shrink-0 text-muted-foreground">Attached · waiting for Send</span> :
              upload.kind === "cover" || upload.kind === "index" ? <label className="text-primary">{upload.kind === "cover" ? "Cover" : "Index"}<select aria-label={`${upload.kind} page output for ${upload.file.name}`} className="ml-2 max-w-48 rounded border bg-background p-1 text-xs" value={upload.pageMode ?? "uploaded"} disabled={busy || applying} onChange={event => setUploads(items => items.map((item, i) => i === index ? {...item,pageMode:event.target.value as "uploaded" | "generated"} : item))}><option value="uploaded">Use uploaded page layout</option><option value="generated">Generate our branded page</option></select></label> : review ? <select aria-label={"Divider for " + upload.file.name} className="max-w-32 rounded-md border bg-background p-1 text-xs" value={upload.sectionTitle.startsWith("new:") ? upload.sectionTitle : assignmentForUpload(upload) || review.sections.find((title) => title.toLowerCase().includes(upload.sectionTitle.toLowerCase()) || upload.sectionTitle.toLowerCase().includes(title.toLowerCase())) || ""} onChange={(event) => setUploads((items) => items.map((item, i) => i === index ? { ...item, sectionTitle: event.target.value } : item))}>
              <option value="">Select divider</option>
              {review.sections.map((title) => <option key={title} value={title}>{title}</option>)}
              <option value={"new:" + upload.file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 100)}>Create divider from filename</option>
            </select> : <span className="max-w-28 truncate text-muted-foreground">{upload.sectionTitle || "Auto match"}</span>}
            {!composePending && (upload.scheduleText || upload.documentText) && <span className="shrink-0 text-emerald-700">{/(?:schedule|technical data sheet|datasheet|tds)/i.test(upload.sectionTitle + " " + upload.file.name) &&
              !detectScheduleSeries(upload.scheduleText ?? upload.documentText ?? "", seriesCatalogue, modelCatalog).series.length ? "Read · no series" : "Read"}</span>}
            {!composePending && upload.scheduleError && <button type="button" className="shrink-0 text-amber-700 underline" disabled={busy || applying || !!readingUploads || sharing} title={upload.scheduleError} onClick={() => void ask(input.trim() || "Retry reading the attached documents and build the submittal.")}>Retry reading</button>}
            <button type="button" aria-label={"Remove " + upload.file.name} onClick={() => setUploads((items) => { const next = items.filter((_, i) => i !== index); if (!next.length) setComposePending(false); return next; })}><X className="size-4" /></button>
          </div>
          {!composePending && upload.scheduleError && <p role="alert" className="mx-2 mb-2 break-words text-xs text-amber-700">{upload.scheduleError}</p>}
          {!composePending && (upload.scheduleText || upload.documentText) && <details className="mx-2 mb-2 rounded-lg border bg-background p-2 text-xs">
            <summary className="cursor-pointer">View text read from {upload.file.name}</summary>
            <p className="mt-1 font-medium">{detectScheduleSeries(upload.scheduleText ?? upload.documentText ?? "", seriesCatalogue, modelCatalog).series.length
              ? `Series found: ${detectScheduleSeries(upload.scheduleText ?? upload.documentText ?? "", seriesCatalogue, modelCatalog).series.join(", ")}`
              : "No exact KINAIR series code found in the extracted text."}</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{(upload.scheduleText ?? upload.documentText ?? "").slice(0, 3000)}</pre>
          </details>}</div>)}
        </div>}
        {replyWorkflow && <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div><p className="font-semibold">{replyWorkflow.kind==="compliance"?"Specification → Compliance Excel":"Consultant Comments → RTCC Excel"}</p><p className="text-xs text-muted-foreground">Source: {replyWorkflow.sourceName} · {replyWorkflow.kind==="compliance"?replyWorkflow.sheet.rows.length:replyWorkflow.rounds[0]?.rows.length??0} point(s)</p></div>
          {replyWorkflowBusy&&<p role="status" className="text-sm text-primary">{replyWorkflowProgress||"Working…"}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" disabled={replyWorkflowBusy} onClick={()=>void downloadReplyExcel()}><FileUp className="size-4" /> Download editable Excel</Button>
            <Button type="button" variant="outline" disabled={replyWorkflowBusy} onClick={()=>replyExcelInputRef.current?.click()}><FileUp className="size-4" /> Upload completed Excel</Button>
            <input ref={replyExcelInputRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" aria-label="Upload completed Compliance or RTCC Excel" onChange={event=>{const file=event.target.files?.[0];void importReplyExcel(file);}}/>
            <Button type="button" className="sm:col-span-2" disabled={replyWorkflowBusy||!replyWorkflow.excelImported||!selectedCompanyId||!selectedBrandId} onClick={()=>void downloadReplyPdf()}><Sparkles className="size-4" /> Generate & download branded PDF</Button>
          </div>
          {!replyWorkflow.excelImported&&<p className="text-xs text-muted-foreground">Edit only the Reply column in the downloaded KINAIR Excel, save it, then upload it here. The source clause/comment columns are used to verify the workbook before replies are accepted.</p>}
          {replyWorkflow.excelImported&&<p className="text-xs text-emerald-700">Excel replies loaded. PDF will use the selected company logo, brand logo and company stamp.</p>}
          <div className="flex flex-wrap gap-2">
            {replyWorkflow.kind==="compliance"&&onOpenCompliance&&<Button type="button" variant="ghost" size="sm" onClick={onOpenCompliance}>Open full Compliance Builder</Button>}
            {replyWorkflow.kind==="rtcc"&&onOpenRtcc&&<Button type="button" variant="ghost" size="sm" onClick={onOpenRtcc}>Open full RTCC Builder</Button>}
          </div>
        </div>}
        {!composePending && !replyWorkflow && <Button type="button" variant="secondary" size="sm" className="mt-2 w-full" onClick={() => void apply("builder")} disabled={applying || busy || !!readingUploads}>
          {applying ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Open full submittal builder {plan ? "with this plan" : ""}
        </Button>}
      </div>
      {!composePending && selectionArtifacts && <div className="mx-4 my-2 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={!selectionArtifacts.schedule} onClick={() => downloadSelectionFile(selectionArtifacts.schedule)}><FileUp className="size-4" /> Material Schedule</Button>
        <Button type="button" variant="outline" disabled={!selectionArtifacts.tds} onClick={() => downloadSelectionFile(selectionArtifacts.tds)}><FileUp className="size-4" /> TDS</Button>
      </div>}
      {!composePending && selectorLoading && uploads.some((item) => item.sectionTitle === "Material schedule" || Boolean(item.selectionItems?.length)) && <p role="status" className="px-4 text-xs text-muted-foreground">Loading fan and air curtain selector data…</p>}
      {(applying || (showSavedPdf && pdfBuilding)) && <p role="status" className="px-4 py-2 text-sm text-primary">{pdfBuilding ? "Building the final PDF with the core submittal engine…" : "Preparing the submittal…"}</p>}
      {showSavedPdf && pdfPrepared && !pdfBuilding && !pdfReady && <Button type="button" className="mx-4 my-2 shrink-0" onClick={onDownloadPdf}><FileUp className="size-4" /> Build & download final submittal PDF</Button>}
      {showSavedPdf && pdfFailed && <div className="px-4 py-2 text-sm text-destructive"><p role="alert">{pdfError || "PDF could not be built. Review the document files."}</p><Button variant="outline" onClick={onDownloadPdf}>Retry PDF build</Button></div>}
      {!!tdsWarnings.length && <div role="alert" className="mx-4 my-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">TDS incomplete — review before issuing</p>
        <p>{tdsWarnings.join("; ")}</p>
        <p className="mt-1">The PDF contains the available sections. Attach the missing TDS or provide the listed data to complete it.</p>
      </div>}
      {showSavedPdf && pdfReady && <div className="mx-4 my-2 space-y-2">
        <Button type="button" variant="outline" className="w-full" disabled={sharing || busy || applying} onClick={async (event) => {
          const clipboardHost = event.currentTarget.parentElement;
          setSharing(true); setShareError(""); setShareCopied(false);
          // A ready link is copied directly during this tap, with no upload or
          // promised ClipboardItem payload to lose iOS user activation.
          if (shareResult && Date.parse(shareResult.expiresAt) > Date.now()) {
            let copyTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              const field = document.createElement("textarea");
              field.value = shareResult.url;
              field.readOnly = true;
              field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
              (clipboardHost ?? document.body).appendChild(field);
              let copied = false;
              try { field.focus(); field.select(); field.setSelectionRange(0, field.value.length); copied = document.execCommand("copy"); }
              finally { field.remove(); }
              if (!copied) {
                const write = navigator.clipboard.writeText(shareResult.url);
                await Promise.race([write, new Promise<never>((_, reject) => { copyTimer = setTimeout(() => reject(new Error("Clipboard unavailable")), 4000); })]);
              }
              setShareCopied(true);
            } catch { setShareError("Link ready. Press and hold the link below to copy it."); }
            finally { if (copyTimer) clearTimeout(copyTimer); setSharing(false); }
            return;
          }
          let timer: ReturnType<typeof setTimeout> | undefined;
          const result = shareResult && Date.parse(shareResult.expiresAt) > Date.now()
            ? Promise.resolve(shareResult)
            : Promise.race([
                Promise.resolve().then(() => onSharePdf()),
                new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Uploading is taking too long. Check your connection and tap Copy share link to retry.")), 120000); }),
              ]).then(value => { setShareResult(value); return value; });
          // Handle upload rejection immediately, even if the clipboard rejects first.
          void result.catch(() => {});
          let clipboard: Promise<void> | undefined;
          try {
            if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
              clipboard = navigator.clipboard.write([new ClipboardItem({ "text/plain": result.then(value => new Blob([value.url], { type: "text/plain" })) })]);
              void clipboard.catch(() => {});
            }
          } catch { /* The generated link remains available for manual copying. */ }
          try {
            const value = await result;
            let copyTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                clipboard ?? navigator.clipboard.writeText(value.url),
                new Promise<never>((_, reject) => { copyTimer = setTimeout(() => reject(new Error("Clipboard unavailable")), 4000); }),
              ]);
              setShareCopied(true);
            } catch {
              setShareError("Link ready. Tap Copy link to copy it.");
            } finally { if (copyTimer) clearTimeout(copyTimer); }
          } catch (error) {
            setShareError(error instanceof Error ? error.message : "Could not create link. Please retry.");
          } finally { if (timer) clearTimeout(timer); setSharing(false); }
        }}>{sharing ? "Preparing link…" : shareCopied ? "✓ Link copied" : shareResult ? "🔗 Copy link" : "🔗 Copy share link"}</Button>
        <p className="text-center text-xs text-muted-foreground">Valid for 7 days</p>
        {shareError && <p role={shareResult ? "status" : "alert"} className={shareResult ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{shareError}</p>}
        {shareError && shareResult && <input aria-label="Submittal share link" readOnly value={shareResult.url} onFocus={event => event.target.select()} className="w-full min-w-0 rounded border bg-background p-2 text-sm" />}
      </div>}
      {showSavedPdf && pdfReady && <Button type="button" className="mx-4 my-2 shrink-0" onClick={onDownloadPdf}><FileUp className="size-4" /> Download final submittal PDF</Button>}
      </div>
      <form className="bottom-0 z-30 grid shrink-0 grid-cols-[minmax(0,1fr)_3rem] items-end gap-2 border-t border-border bg-background/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur sm:flex sm:p-4" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} onFocus={(e) => { const target = e.currentTarget; window.setTimeout(() => target.scrollIntoView({ block: "end", behavior: "smooth" }), 180); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} placeholder="Describe a submittal or a revision…" aria-label="Submittal chat message" className="min-h-12 max-h-28 min-w-0 resize-none text-base sm:max-h-36 sm:flex-1 sm:text-sm" />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0 self-end" disabled={(!input.trim() && !coverDetailsText.trim() && !uploads.length && !customIndexText.trim()) || busy || applying} aria-label="Send submittal request"><Send className="size-5" /></Button>
      </form>
    </SheetContent>
  </Sheet>;
}
