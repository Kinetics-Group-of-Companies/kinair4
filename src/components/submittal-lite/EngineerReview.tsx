import { Button } from '@/components/ui/button';
import type { Section } from '@/lib/submittal-lite/records';
import { rtccReady, type RtccRound } from '@/lib/submittal-lite/rtcc';

export function EngineerReview({sections, rounds, technicalIssues = [], fileError, building, issued, onUpload, uploadBusy}: {
  sections: Section[]; rounds: RtccRound[]; technicalIssues?: string[]; fileError: boolean; building: boolean; issued: boolean; onUpload: (sectionId: string) => void; uploadBusy: boolean;
}) {
  const active = sections.filter(s => !s.auto);
  const missing = active.filter(s => !s.docs.length);
  const pending = rounds.flatMap(r => r.rows.filter(row => !rtccReady([{...r, rows:[row]}])).map(row => `RTCC ${r.number}: ${row.comment}`));
  const emptyRounds = rounds.filter(r => !r.rows.length).map(r => `RTCC ${r.number}: no comments extracted`);
  const checks = [...new Set([...technicalIssues, ...missing.map(s => `Upload documents: ${s.title}`), ...emptyRounds, ...pending,
    ...(fileError ? ['Some files could not be read. Re-upload the affected files before issuing.'] : [])])];
  return <details aria-label="Engineer review checklist" className="min-w-0 break-words rounded-2xl border bg-card p-4 space-y-3">
    <summary className="cursor-pointer text-sm font-semibold">Document checklist · {issued ? 'Issued copy locked' : `${checks.length} action${checks.length === 1 ? '' : 's'} required`}</summary>
    <p className="text-xs text-muted-foreground">{active.length - missing.length} / {active.length} dividers have documents · {rounds.reduce((n,r)=>n+r.rows.filter(row=>row.reviewed).length,0)} RTCC replies reviewed. Document presence does not verify technical compliance.</p>
    {building && <p role="status" className="text-sm">PDF is rebuilding. Wait for the preview before final review.</p>}
    {!!(technicalIssues.length || pending.length || emptyRounds.length || fileError) && <ul className="max-h-64 list-disc space-y-2 overflow-auto pl-5 text-sm">{[...technicalIssues,...emptyRounds,...pending,...(fileError?["Some files could not be read. Re-upload them."]:[])].map(check=><li key={check}>{check}</li>)}</ul>}
    {!issued && !!missing.length && <div className="grid gap-2 sm:grid-cols-2">{missing.map(section=><Button key={section.id} variant="outline" className="h-auto min-h-10 whitespace-normal text-left text-xs" disabled={uploadBusy} onClick={()=>onUpload(section.id)}>Upload · {section.title}</Button>)}</div>}
    {!checks.length && <p className="text-sm">No outstanding automated checks. Review the final PDF, model coverage, quantities and certificate applicability before issuing.</p>}
  </details>;
}
