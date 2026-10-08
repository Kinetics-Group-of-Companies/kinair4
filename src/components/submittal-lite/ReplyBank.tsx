import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as client } from '@/integrations/backend/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { extractSetupText, readScannedPage } from '@/lib/submittal-lite/extract';
import { reuseReply, sameReplyScope, type ReplyScope, type SavedReply } from '@/lib/submittal-lite/advanced';
import { validateEvidence, type RtccRow } from '@/lib/submittal-lite/rtcc';
import type { DocRef } from '@/lib/submittal-lite/records';
const db=client as unknown as SupabaseClient;
type Props={tenantId:string;scope:ReplyScope;rows:RtccRow[];docs:DocRef[];bytesOf:(id:string)=>Promise<ArrayBuffer|undefined>;onReuse:(row:RtccRow)=>void;onBusy:(busy:boolean)=>void};
export function ReplyBank({tenantId,scope,rows,docs,bytesOf,onReuse,onBusy}:Props){
 const [open,setOpen]=useState(false),[entries,setEntries]=useState<SavedReply[]>([]),[target,setTarget]=useState(''),[applicability,setApplicability]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[userId,setUserId]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);onBusy(true);setNotice('');try{await fn();}catch(e){if(alive.current)setNotice(e instanceof Error?e.message:'Could not update reply bank.');}finally{if(alive.current)setBusy(false);onBusy(false);}};
 const refresh=async()=>{const [{data,error},{data:auth}]=await Promise.all([db.from('submittal_reply_bank').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(500),db.auth.getUser()]);if(error)throw error;if(alive.current){setEntries((data||[]) as SavedReply[]);setUserId(auth.user?.id||'');}};
 const evidenceTexts=async(row:RtccRow)=>{const result:{id:string;text:string}[]=[];for(const e of row.evidence){const d=docs.find(d=>d.id===e.docId);if(!d)throw new Error('Attach the original supporting document before saving or reusing this reply.');const bytes=await bytesOf(d.id);if(!bytes)throw new Error(`Could not read ${d.name}.`);result.push({id:d.id,text:await extractSetupText(new File([bytes],d.name,{type:d.type}),readScannedPage)});}return result;};
 const selected=rows.find(r=>r.id===target);
 const save=()=>void run(async()=>{if(!selected?.reviewed)throw new Error('Select an engineer-reviewed reply.');if(!scope.companyId||!scope.brandId)throw new Error('Select company and brand first.');if(applicability.trim().length<10)throw new Error('Describe where this reply applies and any exclusions.');const texts=await evidenceTexts(selected);if(!selected.evidence.length||validateEvidence(selected.evidence,texts).length!==selected.evidence.length)throw new Error('Add exact evidence quotations from the attached documents. A document name or generic reference is insufficient.');const {error}=await db.from('submittal_reply_bank').insert({tenant_id:tenantId,scope,row:selected,applicability:applicability.trim()});if(error)throw error;await refresh();if(alive.current){setApplicability('');setNotice('Approved reply saved for this company, brand and product selection.');}});
 return <div className="rounded-xl border bg-muted/20 p-3 space-y-3"><Button variant="outline" disabled={busy} onClick={()=>{setOpen(!open);if(!open)void run(refresh);}}>Approved reply knowledge bank</Button>
 {open&&<><p className="text-xs text-muted-foreground">Evidence-backed replies for the exact company, brand and product selection. Reuse always requires another engineer review. Latest 500 saved entries are shown.</p>
 <label className="block text-sm">Current comment<select className="mt-1 w-full rounded border bg-background p-2" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose a comment to save or fill</option>{rows.map((r,i)=><option key={r.id} value={r.id}>{i+1}. {r.comment.slice(0,100)}</option>)}</select></label>
 <Textarea value={applicability} onChange={e=>setApplicability(e.target.value)} placeholder="Applicability and exclusions — model, duty, environment, project-specific conditions…" aria-label="Saved reply applicability"/>
 <Button disabled={busy||!selected?.reviewed||applicability.trim().length<10} onClick={save}>Save approved reply</Button>
 <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search saved comments and replies" aria-label="Search reply bank"/>
 <div className="max-h-96 overflow-auto space-y-2">{entries.filter(e=>sameReplyScope(e.scope,scope)&&`${e.row.comment} ${e.row.reply}`.toLowerCase().includes(search.toLowerCase())).map(e=><div key={e.id} className="rounded-lg border bg-card p-3 space-y-2"><p className="text-sm font-semibold">{e.row.comment}</p><p className="text-sm whitespace-pre-wrap">{e.row.reply}</p><p className="text-xs text-muted-foreground">Applies to: {e.applicability} · Saved {new Date(e.created_at).toLocaleDateString()}</p><div className="flex gap-2"><Button size="sm" disabled={busy||!selected} onClick={()=>void run(async()=>{if(!selected)return;const texts=await evidenceTexts(e.row);const next=reuseReply(e,scope,selected,texts);if(alive.current){onReuse(next);setNotice('Reply inserted as an unreviewed draft. Verify it against this consultant comment and current project.');}})}>Verify evidence & reuse</Button>{e.created_by===userId&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void run(async()=>{const {error}=await db.from('submittal_reply_bank').delete().eq('tenant_id',tenantId).eq('id',e.id);if(error)throw error;await refresh();})}>Remove saved reply</Button>}</div></div>)}</div>
 {!entries.some(e=>sameReplyScope(e.scope,scope))&&<p className="text-sm">No saved replies for this selection yet.</p>}
 </>}{notice&&<p role="status" className="text-sm">{notice}</p>}</div>;
}
