import { useMemo, useRef, useState } from "react";
import { Link, Copy, FilePlus2, FolderOpen, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, statusDot, statusTone, statuses, type Kind, type Status, type SubmittalRecord } from "@/lib/submittal-lite/records";
import type { Brand, Company } from "@/lib/submittal-lite/library";

type Props = {
  records: SubmittalRecord[]; companies: Company[]; brands: Brand[];
  onNew: () => void; onEdit: (r: SubmittalRecord) => void; onDuplicate: (r: SubmittalRecord) => void; onDelete: (id: string) => void;
  onNoClientSpecification: (record: SubmittalRecord) => Promise<void>;
  onShare: (record: SubmittalRecord) => Promise<{ url: string; expiresAt: string }>;
  onStatus: (id: string, s: Status, note: string) => Promise<void>;
};

function ShareRecordAction({ record, onShare }: Pick<Props, "onShare"> & { record: SubmittalRecord }) {
  const [result, setResult] = useState<{ url: string; expiresAt: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const missing = record.issuedPdf ? [] : record.sections.filter(s => !s.auto && !s.docs.length && !s.notApplicableReason?.trim()).map(s => s.title);
  const copy = async () => {
    if (lock.current || (missing.length > 0 && !allowIncomplete)) return;
    if (result && Date.parse(result.expiresAt) > Date.now() + 60_000) {
      input.current?.select();
      try {
        if (!document.execCommand("copy")) await navigator.clipboard.writeText(result.url);
        setMessage("Link copied"); setFailed(false);
      } catch { setMessage("Select the link below to copy it."); }
      return;
    }
    lock.current = true; setBusy(true); setFailed(false); setMessage("");
    const task = onShare(record);
    // Start clipboard access during the tap, before PDF building/uploading.
    let copied: Promise<boolean> = Promise.resolve(false);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        copied = navigator.clipboard.write([new ClipboardItem({ "text/plain": task.then((value) => new Blob([value.url], { type: "text/plain" })) })]).then(() => true, () => false);
      }
    } catch { /* A second tap can copy the ready URL. */ }
    try {
      const value = await task; setResult(value);
      setMessage(await Promise.race([copied, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000))]) ? "Link copied" : "Link ready. Tap Copy share link to copy it.");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Could not create the link. Please retry."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="mt-4 rounded-2xl border bg-primary/5 p-3">
    {missing.length > 0 && <div className="mb-3 rounded-xl border border-amber-400 p-3 text-sm"><p className="font-semibold">Missing documents</p><ul className="list-disc pl-5">{missing.map((title, i) => <li key={i}>{title}</li>)}</ul><label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={allowIncomplete} onChange={e => setAllowIncomplete(e.target.checked)} />Share as incomplete draft using available documents</label><p className="mt-1 text-xs">This does not mark the submittal Submitted. Upload the missing documents in Edit before issuing.</p></div>}
    <Button variant="outline" className="w-full" disabled={busy || (missing.length > 0 && !allowIncomplete)} onClick={() => void copy()}><Link />{busy ? "Preparing link…" : "Copy share link"}</Button>
    <p className="mt-2 text-center text-xs text-muted-foreground">{result ? `Valid until ${new Date(result.expiresAt).toLocaleDateString()}` : "Branded link · valid for 7 days"}</p>
    {message && <p role="status" className={`mt-2 text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>}
    {result && <Input ref={input} readOnly value={result.url} aria-label="Submittal share link" onFocus={(event) => event.target.select()} className="mt-2 text-xs" />}
  </div>;
}

const groups: { label: string; match: (s: Status) => boolean }[] = [
  { label: "All", match: () => true },
  { label: "Drafts", match: (s) => s === "Draft" },
  { label: "In review", match: (s) => s === "Submitted" || s === "Under review" },
  { label: "Approved", match: (s) => s.startsWith("Approved") },
  { label: "Action needed", match: (s) => s === "Revise & resubmit" || s === "Rejected" },
];

export function SubmittalsHome({ records, companies, brands, onNew, onEdit, onDuplicate, onDelete, onStatus, onShare, onNoClientSpecification }: Props) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("All");
  const [kind, setKind] = useState<"All" | Kind>("All");
  const [openId, setOpenId] = useState<string>();
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();
  const [note, setNote] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusFailed, setStatusFailed] = useState(false);
  const statusLock = useRef(false);
  const updateStatus = async (id: string, status: Status) => {
    if (statusLock.current) return;
    statusLock.current = true; setStatusBusy(true); setStatusFailed(false);
    setStatusMessage(status === "Submitted" ? "Preparing issued PDF and saving status…" : "Saving status…");
    try { await onStatus(id, status, note.trim()); setNote(""); setStatusMessage(`Status updated: ${status}`); }
    catch(error) { setStatusFailed(true); setStatusMessage(error instanceof Error ? error.message : "Status update failed. Please retry."); }
    finally { statusLock.current = false; setStatusBusy(false); }
  };
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? "";

  const shown = useMemo(() => {
    const g = groups.find((x) => x.label === group) ?? groups[0]!;
    const s = q.trim().toLowerCase();
    return records
      .filter((r) => g.match(r.status) && (kind === "All" || r.kind === kind))
      .filter((r) => !s || [r.ref, r.title, r.project, r.status, name(brands, r.brandId), name(companies, r.companyId), ...r.fields.map((f) => f.value)].join(" ").toLowerCase().includes(s))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [records, q, group, kind, brands, companies]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = records.find((r) => r.id === openId);
  const revisions = open ? records.filter((r) => r.ref === open.ref).sort((a, b) => b.rev - a.rev) : [];

  return (
    <main className="px-5 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-grad-hero p-6 text-primary-foreground shadow-clay lg:p-8">
        <div className="animate-blob absolute -right-10 -top-10 size-52 rounded-full bg-grad-primary opacity-60 blur-3xl" aria-hidden /><div className="animate-blob absolute -bottom-16 left-10 size-44 rounded-full bg-grad-teal opacity-50 blur-3xl [animation-delay:-4s]" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary-foreground/80">Submittal register</p>
          <h2 className="mt-1 font-display text-3xl font-semibold leading-tight lg:text-4xl">Every submittal,<br className="sm:hidden" /> one place.</h2>
          <div className="relative mt-5">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ref no, title, project, brand…" aria-label="Search submittals" className="h-14 rounded-2xl border-0 bg-card pl-12 text-base font-semibold text-foreground shadow-clay-sm" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"><X className="size-4" /></button>}
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {groups.slice(1).map((g, gi) => { const tone = ["bg-grad-sun text-foreground", "bg-grad-teal", "bg-grad-lime text-foreground", "bg-grad-rose"][gi]; const n = records.filter((r) => g.match(r.status)).length; const on = group === g.label; return (
              <button key={g.label} type="button" onClick={() => setGroup(on ? "All" : g.label)} className={`rounded-2xl p-2.5 text-left transition ${tone} shadow-clay-sm hover:-translate-y-1 ${on ? "ring-4 ring-primary-foreground scale-105" : "opacity-90 hover:opacity-100"}`}>
                <p className="font-display text-2xl font-semibold">{n}</p><p className="text-[10px] font-bold leading-tight opacity-80">{g.label}</p>
              </button>); })}
          </div>
        </div>
      </section>

      <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
        {(["All", "Material", "PQ", "O&M"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold ${kind === k ? "bg-grad-primary text-primary-foreground shadow-glow" : "bg-card shadow-clay-sm"}`}>{k}</button>)}
        <span className="ml-auto shrink-0 text-xs font-bold text-muted-foreground">{shown.length} of {records.length}</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {shown.map((r) => (
          <button key={r.id} type="button" onClick={() => { setOpenId(r.id); setNote(""); setStatusMessage(""); }} className="group relative overflow-hidden rounded-3xl bg-card p-4 pl-5 text-left shadow-clay-sm ring-1 ring-border/60 transition duration-200 hover:-translate-y-1 hover:shadow-clay hover:ring-primary/50">
            <span className={`absolute inset-y-0 left-0 w-1.5 ${statusDot(r.status)}`} aria-hidden />
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-primary px-2 py-1 font-mono text-[11px] font-bold text-primary-foreground">{r.ref}{r.rev ? ` · R${r.rev}` : ""}</span>
              <span className="text-[10px] font-extrabold uppercase text-muted-foreground">{r.kind}</span>
              <span className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusTone(r.status)}`}><span className={`size-1.5 rounded-full ${statusDot(r.status)}`} />{r.status}</span>
            </div>
            <h3 className="mt-2.5 line-clamp-2 font-display text-[17px] font-semibold leading-snug">{r.title || "Untitled submittal"}</h3>
            <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{[r.project, name(brands, r.brandId)].filter(Boolean).join(" · ") || name(companies, r.companyId)}</p>
            <p className="mt-2 text-[10px] font-bold text-muted-foreground">Updated {fmtDate(r.updatedAt)} · {r.sections.length} dividers</p>
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <div className="mt-4 rounded-3xl bg-card p-10 text-center shadow-clay-sm">
          <FolderOpen className="mx-auto mb-3 size-10 text-primary" />
          <p className="font-display text-lg font-semibold">{records.length ? "No submittals match" : "No submittals yet"}</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{records.length ? "Try another search or filter." : "Create your first one — it gets a reference number automatically."}</p>
          {!records.length && <Button variant="default" size="default" className="mt-5" onClick={onNew}><FilePlus2 /> New submittal</Button>}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="rec-title">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-card p-5 shadow-clay sm:rounded-[2rem]">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <span className="rounded-lg bg-primary px-2 py-1 font-mono text-xs font-bold text-primary-foreground">{open.ref}{open.rev ? ` · Rev ${open.rev}` : ""}</span>
                <h2 id="rec-title" className="mt-2 font-display text-xl font-semibold leading-snug">{open.title || "Untitled submittal"}</h2>
                <p className="text-xs font-semibold text-muted-foreground">{open.kind} · {name(companies, open.companyId)}{open.brandId && ` · ${name(brands, open.brandId)}`}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setPendingDeleteId(undefined); setOpenId(undefined); }} aria-label="Close"><X /></Button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button variant="default" onClick={() => onEdit(open)}><Pencil /> Edit</Button>
              <Button variant="outline" onClick={() => { onDuplicate(open); setOpenId(undefined); }}><Copy /> New revision</Button>
              <Button variant="outline" className="text-destructive" onClick={() => setPendingDeleteId(open.id)}><Trash2 /> Delete</Button>
            </div>

            {!open.issuedPdf && open.sections.some(s => !s.docs.length && !s.notApplicableReason && /specification|compliance/i.test(s.title)) && <div className="mt-3 rounded-xl border p-3 text-sm"><p>Client included specification/compliance in the index but did not provide a project specification?</p><Button variant="outline" className="mt-2 h-auto whitespace-normal" disabled={statusBusy} onClick={async () => {
              if (statusLock.current) return;
              statusLock.current=true;setStatusBusy(true);setStatusMessage("");
              try {await onNoClientSpecification(open);setStatusFailed(false);setStatusMessage("Saved: client specification not provided. The index dividers will show the reason.");}
              catch(error){setStatusFailed(true);setStatusMessage(error instanceof Error ? error.message : "Could not save exception.");}
              finally{statusLock.current=false;setStatusBusy(false);}
            }}>Confirm client specification not provided</Button></div>}
            {open.sections.filter(s => !s.docs.length && s.notApplicableReason).map(s => <p key={s.id} className="mt-2 text-xs text-muted-foreground">{s.title}: {s.notApplicableReason}</p>)}
            <ShareRecordAction key={JSON.stringify(open)} record={open} onShare={onShare} />

            {pendingDeleteId === open.id && (
              <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-bold text-destructive">Delete {open.ref}{open.rev ? ` Rev ${open.rev}` : ""}?</p>
                <p className="mt-1 text-xs text-muted-foreground">The record will be removed and uploads not used anywhere else will be cleaned up.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPendingDeleteId(undefined)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const id = open.id;
                      setPendingDeleteId(undefined);
                      setOpenId(undefined);
                      window.setTimeout(() => onDelete(id), 0);
                    }}
                  ><Trash2 /> Delete</Button>
                </div>
              </div>
            )}

            <p className="mt-5 text-[11px] font-extrabold uppercase text-muted-foreground">Update status</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{statuses.map((s) => <button key={s} type="button" disabled={statusBusy} onClick={() => void updateStatus(open.id, s)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${open.status === s ? "bg-grad-primary text-primary-foreground shadow-glow" : "bg-background"}`}>{s}</button>)}</div>
            {statusMessage && <p role={statusFailed ? "alert" : "status"} className={`mt-3 rounded-xl border p-3 text-sm ${statusFailed ? "border-destructive/40 text-destructive" : "text-muted-foreground"}`}>{statusMessage}</p>}
            {!open.issuedPdf && <p className="mt-2 text-xs text-muted-foreground">Submitted saves a fixed PDF of this revision. Review documents before submitting; later changes require a new revision.</p>}
            <Textarea disabled={statusBusy} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note or consultant comment (saved with the next status)" className="mt-2 min-h-16 rounded-2xl border-0 bg-background text-sm" />

            <p className="mt-5 text-[11px] font-extrabold uppercase text-muted-foreground">Revisions of {open.ref}</p>
            <div className="mt-2 flex flex-wrap gap-2">{revisions.map((r) => <button key={r.id} type="button" onClick={() => { setOpenId(r.id); setNote(""); setStatusMessage(""); }} className={`rounded-xl px-3 py-2 text-left text-xs font-bold ${r.id === open.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`} aria-label={`Open revision ${r.rev} of ${r.ref}`}><span className="block">Rev {r.rev}</span><span className="block text-[10px] opacity-75">{r.status} · {fmtDate(r.createdAt)}</span></button>)}</div>
            <p className="mt-2 text-xs text-muted-foreground">Open any earlier revision, then choose Edit or New revision to reuse its contents.</p>
            <p className="mt-5 text-[11px] font-extrabold uppercase text-muted-foreground">Tracking</p>
            <ol className="mt-2 space-y-0">
              {[...open.history].reverse().map((h, i) => (
                <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                  <span className={`relative z-10 mt-1 size-3 shrink-0 rounded-full ring-4 ring-card ${statusDot(h.status)}`} />
                  {i < open.history.length - 1 && <span className="absolute left-[5px] top-4 h-full w-0.5 bg-border" aria-hidden />}
                  <div><p className="text-sm font-bold">{h.status}</p><p className="text-[11px] font-semibold text-muted-foreground">{new Date(h.at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>{h.note && <p className="mt-1 rounded-xl bg-background px-3 py-2 text-xs font-semibold">{h.note}</p>}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}

