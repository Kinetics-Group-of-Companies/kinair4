import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { latestProjects, reusableProjectFields } from '@/lib/submittal-lite/project-reuse';
import type { Field, SubmittalRecord } from '@/lib/submittal-lite/records';
export function ProjectDetailsReuse({records,onApply,disabled=false}:{records:SubmittalRecord[];onApply:(fields:Field[])=>void;disabled?:boolean}) {
  const [id,setId] = useState('');
  const projects = latestProjects(records);
  const selected = projects.find(p=>p.id===id);
  const fields = selected ? reusableProjectFields(selected) : [];
  if (!projects.length) return null;
  return <details className="min-w-0 break-words rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Copy details from another project (optional)</summary>
    <p className="my-2 text-xs text-muted-foreground">Preview the latest saved details, then copy them. This replaces project details only; choose the supplier, brand and documents separately.</p>
    {disabled && <p className="mb-2 text-xs text-muted-foreground">Unavailable while processing, for an issued copy, or when an uploaded cover controls the project details.</p>}
    <select aria-label="Saved project to reuse" disabled={disabled} value={id} onChange={e=>setId(e.target.value)} className="min-w-0 max-w-full w-full rounded border bg-background p-2 text-sm"><option value="">Choose project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project || p.title} · {p.ref} R{p.rev}</option>)}</select>
    {!!fields.length && <><dl className="my-3 space-y-1 text-xs">{fields.map(f=><div key={f.label} className="grid grid-cols-2 gap-2"><dt className="font-semibold">{f.label}</dt><dd>{f.value}</dd></div>)}</dl><Button disabled={disabled} onClick={()=>{onApply(fields.map(f=>({...f})));setId('');}}>Use these project details</Button></>}
  </details>;
}
