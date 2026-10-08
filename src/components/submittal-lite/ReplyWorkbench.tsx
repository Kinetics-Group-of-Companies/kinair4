import { QuickReplyComposer } from './QuickReplyComposer';
import { PointDisposition } from './PointDisposition';
import { requiresReply, replyPointReady } from '@/lib/submittal-lite/reply-points';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { RtccRow } from '@/lib/submittal-lite/rtcc';
import type { DocRef } from '@/lib/submittal-lite/records';

type Item = RtccRow & { label: string };
type Props = { rows: Item[]; docs: DocRef[]; onPatch: (id:string, patch:Partial<RtccRow>)=>void; onGenerate: (id:string)=>void };


/** One reply at a time, without a horizontally scrolling table. */
export function ReplyWorkbench({rows,docs,onPatch,onGenerate}:Props){
 const [selected,setSelected]=useState(''),[query,setQuery]=useState('');
 const [undo,setUndo]=useState<{id:string;before:string;after:string}>();
 const replyRef=useRef<HTMLTextAreaElement>(null);
 const matches=rows.filter(r=>(r.label+' '+r.comment).toLowerCase().includes(query.toLowerCase()));
 const row=matches.find(r=>r.id===selected)||matches[0];
 const index=row?matches.findIndex(r=>r.id===row.id):-1;
 const touch='min-h-11 px-4 text-sm';
 const apply=(text:string)=>{
  if(!row)return;
  const after=row.reply.trim()?row.reply+'\n'+text:text;
  setUndo({id:row.id,before:row.reply,after});onPatch(row.id,{reply:after,reviewed:false});
  requestAnimationFrame(()=>{replyRef.current?.focus({preventScroll:true});replyRef.current?.setSelectionRange(after.length,after.length);});
 };
 const nextPending=()=>{
  const candidates=[...matches.slice(index+1),...matches.slice(0,index)];
  const next=candidates.find(r=>!replyPointReady(r));if(next)setSelected(next.id);
 };
 return <div className="min-w-0 space-y-4 rounded-xl border bg-background p-3 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Easy reply editor</h3><span className="text-sm text-muted-foreground">{rows.filter(replyPointReady).length} / {rows.length} reviewed</span></div>
  <label className="block text-sm font-medium">Find a comment or clause<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search number or original wording…" className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"/></label>
  {!!matches.length&&<div className="flex flex-wrap items-center gap-2">
   <Button type="button" variant="outline" className={touch} disabled={index<=0} onClick={()=>setSelected(matches[index-1].id)}>← Previous</Button>
   <label className="min-w-0 flex-1 text-sm"><span className="sr-only">Jump to comment or clause</span><select aria-label="Jump to comment or clause" value={row?.id} onChange={e=>setSelected(e.target.value)} className="min-h-11 w-full min-w-32 rounded-md border bg-background px-2 text-base">{matches.map(r=><option key={r.id} value={r.id}>{r.label} · {replyPointReady(r)?'Reviewed':!requiresReply(r)?'Confirm no reply':r.reply.trim()?'Draft':'No reply'} · {r.comment.slice(0,70)}</option>)}</select></label>
   <Button type="button" variant="outline" className={touch} disabled={index>=matches.length-1} onClick={()=>setSelected(matches[index+1].id)}>Next →</Button>
   <Button type="button" variant="outline" className={touch} disabled={!matches.some(r=>r.id!==row?.id&&!replyPointReady(r))} onClick={nextPending}>Next needing review</Button>
  </div>}
  {!row?<p role="status" className="text-sm text-muted-foreground">{rows.length?'No matching comments. Clear the search to see all replies.':'No reply points yet. Included points appear here; excluded clauses stay in Table & details.'}</p>:<div key={row.id} className="space-y-4">
   <div className="rounded-lg border bg-muted/30 p-4"><p className="mb-2 text-sm font-semibold">{row.label} · Original wording</p><p className="whitespace-pre-wrap break-words text-base leading-relaxed">{row.comment.slice(0,700)||'No source wording. Add it in Table & details.'}</p>{row.comment.length>700&&<details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary">Show remaining original wording</summary><p className="whitespace-pre-wrap break-words text-base leading-relaxed">{row.comment.slice(700)}</p></details>}</div>
   <PointDisposition row={row} onChange={patch=>onPatch(row.id,patch)}/>
   <div hidden={!requiresReply(row)} className="space-y-4"><QuickReplyComposer key={row.id} onInsert={apply}/>
   <label className="block text-sm font-semibold">Your reply<Textarea ref={replyRef} aria-label={`Reply for ${row.label}`} value={row.reply} onChange={e=>onPatch(row.id,{reply:e.target.value,reviewed:false})} rows={8} className="mt-2 min-h-56 w-full resize-y border-2 border-primary/30 bg-background p-4 text-base leading-relaxed focus-visible:border-primary" placeholder="Select and insert quick replies above, or type your response here…"/></label>
   <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className={touch} disabled={!row.comment.trim()} onClick={()=>onGenerate(row.id)}>{row.reply.trim()?'AI regenerate reply':'AI draft reply'}</Button>{undo?.id===row.id&&undo.after===row.reply&&<Button type="button" variant="outline" className={touch} onClick={()=>{onPatch(row.id,{reply:undo.before,reviewed:false});setUndo(undefined);}}>Undo quick reply</Button>}</div>
   <label className="block text-sm font-medium">Responsibility<select value={row.responsibility} onChange={e=>onPatch(row.id,{responsibility:e.target.value as RtccRow['responsibility'],reviewed:false})} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base">{['Supplier','Contractor','Joint'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label className="block text-sm font-medium">Add supporting document<select value="" onChange={e=>{if(e.target.value)onPatch(row.id,{evidence:[...row.evidence,{docId:e.target.value,quote:''}],reviewed:false});}} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"><option value="">Choose a document…</option>{docs.filter(d=>!row.evidence.some(e=>e.docId===d.id)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
   {row.evidence.map((e,i)=><div key={`${e.docId}-${i}`} className="space-y-2 rounded-md border p-3"><p className="break-words text-sm font-medium">{docs.find(d=>d.id===e.docId)?.name||'Missing document'}</p><Textarea aria-label={`Evidence quotation ${i+1}`} value={e.quote} placeholder="Exact supporting quotation…" className="text-base" onChange={event=>onPatch(row.id,{evidence:row.evidence.map((v,n)=>n===i?{...v,quote:event.target.value}:v),reviewed:false})}/><Button type="button" variant="outline" className={touch} onClick={()=>onPatch(row.id,{evidence:row.evidence.filter((_,n)=>n!==i),reviewed:false})}>Remove reference</Button></div>)}
   {row.reviewNote&&<p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.reviewNote}</p>}
   </div>
   <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium"><input type="checkbox" className="h-5 w-5" checked={row.reviewed} disabled={!replyPointReady({...row,reviewed:true})} onChange={e=>onPatch(row.id,{reviewed:e.target.checked})}/>{requiresReply(row)?'Engineer checked reply and evidence':'Engineer confirmed no reply is required'}</label>
   <div className="flex flex-wrap justify-between gap-2"><span className="text-sm text-muted-foreground">{index+1} of {matches.length}</span><Button type="button" variant="outline" className={touch} disabled={index>=matches.length-1} onClick={()=>setSelected(matches[index+1].id)}>Next reply →</Button></div>
  </div>}
 </div>;
}
