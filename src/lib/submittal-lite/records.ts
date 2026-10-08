import type { RtccRound } from "./rtcc";
export type IndexMode = "general" | "project" | "customer";
export type Kind = "Material" | "PQ" | "O&M";
export type StampMode = "all" | "divider" | "none";
export type DocRef = { id: string; name: string; type: string; size?: number; pages?: number; auto?: boolean };
export type Section = { id: string; title: string; docs: DocRef[]; notApplicableReason?: string; auto?: boolean; stamp?: StampMode };
export type Field = { label: string; value: string };
export const statuses = ["Draft", "Submitted", "Under review", "Approved", "Approved as noted", "Revise & resubmit", "Rejected"] as const;
export type Status = (typeof statuses)[number];
export type HistoryItem = { status: Status; at: string; note?: string };

export type SubmittalRecord = {
  replyDocumentIds?: string[];
  rtcc?: RtccRound[];
  compliance?: import("./compliance").ComplianceSheet;
  issuedPdf?: DocRef;
  issuedLabels?: { label: string; kind: "cover" | "index" | "divider" | "doc"; docId?: string }[];
  issuedAt?: string;
  technicalIssues?: string[];
  id: string; ref: string; rev: number; kind: Kind; status: Status; title: string; coverHeading?: string; project: string;
  companyId: string; brandId: string; seriesIds: string[]; customProducts?: string[]; stampAll: boolean; stampCover?: boolean; stampIndex?: boolean;
  useDefaultCover?: boolean; useDefaultIndex?: boolean; indexMode?: IndexMode;
  coverPageMode?: "uploaded" | "generated"; indexPageMode?: "uploaded" | "generated"; dividerPageMode?: "uploaded" | "generated";
  coverText: string; indexText: string; coverDoc?: DocRef; indexDoc?: DocRef; dividerDoc?: DocRef; fields: Field[]; sections: Section[];
  createdAt: string; updatedAt: string; history: HistoryItem[];
};

export const prefix: Record<Kind, string> = { Material: "MAT", PQ: "PQ", "O&M": "OM" };

export function nextRef(kind: Kind, records: SubmittalRecord[]) {
  const year = new Date().getFullYear();
  const p = `${prefix[kind]}-${year}-`;
  const max = records.filter((r) => r.ref.startsWith(p)).reduce((m, r) => Math.max(m, Number(r.ref.slice(p.length)) || 0), 0);
  return `${p}${String(max + 1).padStart(4, "0")}`;
}

export const statusTone = (s: Status) =>
  s === "Approved" ? "bg-success/30 text-foreground" :
  s === "Approved as noted" ? "bg-success/20 text-foreground" :
  s === "Revise & resubmit" || s === "Rejected" ? "bg-destructive/15 text-destructive" :
  s === "Draft" ? "bg-muted text-muted-foreground" :
  s === "Under review" ? "bg-info/25 text-foreground" : "bg-warning/30 text-foreground";

export const statusDot = (s: Status) =>
  s.startsWith("Approved") ? "bg-success" : s === "Revise & resubmit" || s === "Rejected" ? "bg-destructive" : s === "Draft" ? "bg-muted-foreground" : s === "Under review" ? "bg-info" : "bg-warning";

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function loadRecords(): SubmittalRecord[] {
  try { return JSON.parse(localStorage.getItem("submittals:records") ?? "[]"); } catch { return []; }
}
export const saveRecords = (r: SubmittalRecord[]) => localStorage.setItem("submittals:records", JSON.stringify(r));


