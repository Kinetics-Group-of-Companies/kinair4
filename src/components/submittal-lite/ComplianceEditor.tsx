import { ReplyExcelImport } from './ReplyExcelImport';
import { matchImportedReplies } from '@/lib/submittal-lite/review-import';
import { InlineQuickReplies } from './InlineQuickReplies';
import { ReplyDocumentHeader } from './ReplyDocumentHeader';
import { PointDisposition } from './PointDisposition';
import { requiresReply, replyPointReady } from '@/lib/submittal-lite/reply-points';
import { ReplyWorkbench } from './ReplyWorkbench';
import { ReviewPdfActions } from './ReviewPdfActions';
import { ReplyTableSizing } from './ReplyTableSizing';
import {complianceExportTables,downloadReviewExcel} from '@/lib/submittal-lite/review-excel';
import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '@/integrations/backend/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {type ComplianceSheet,type ComplianceRow,specificationRows,complianceReady,complianceProposedTitle,specificationBody,specificationComment} from '@/lib/submittal-lite/compliance';
import {readSpecification} from '@/lib/submittal-lite/compliance-read';
import {buildCompliancePdf} from '@/lib/submittal-lite/compliance-pdf';
import type {ReviewPdfBranding} from '@/lib/submittal-lite/review-pdf';
import {validateEvidence} from '@/lib/submittal-lite/rtcc';
import {sameReplyScope,type ReplyScope} from '@/lib/submittal-lite/advanced';
import {uploadSubmittalFile} from '@/lib/submittal-lite/idb';
import type {DocRef,Field,Section} from '@/lib/submittal-lite/records';
const db=supabase as unknown as SupabaseClient;
type Saved={id:string;created_at:string;title:string;scope:ReplyScope;sheet:ComplianceSheet;approved:boolean};
type Props={standalone?:boolean;tenantId:string;scope:ReplyScope;fields:Field[];sections:Section[];sheet?:ComplianceSheet;onChange:(s:ComplianceSheet)=>void;onAttach:(d:DocRef)=>void;bytesOf:(id:string)=>Promise<ArrayBuffer|undefined>;onSupportAttach:(sectionId:string,doc:DocRef)=>void;onBusy:(b:boolean)=>void;branding?:ReviewPdfBranding;brandingReady?:boolean};

export function ComplianceEditor({tenantId,scope,fields,sections,sheet,onChange,onAttach,bytesOf,onBusy,onSupportAttach,standalone=false,branding={},brandingReady=true}:Props){
 const [tableMode,setTableMode]=useState(true);
 const [sourceWidth,setSourceWidth]=useState(420),[replyWidth,setReplyWidth]=useState(520),[autoReply,setAutoReply]=useState(false);
 const [text,setText]=useState(''),[file,setFile]=useState<File>(),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[saved,setSaved]=useState<Saved[]>([]),[search,setSearch]=useState(''),[parent,setParent]=useState<string>();
 const evidenceCache=useRef(new Map<string,{id:string;name:string;text:string}[]>());
 const input=useRef<HTMLInputElement>(null),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const docs=[...new Map(sections.filter(s=>!s.auto&&!/specification|compliance/i.test(s.title)).flatMap(s=>s.docs.map(d=>[d.id,d] as const))).values()];
 const contextKey=JSON.stringify({scope,fields,docs:docs.map(d=>d.id)});
 const lastContext=useRef(sheet?.contextKey||contextKey);
 useEffect(()=>{if(lastContext.current!==contextKey){lastContext.current=contextKey;if(sheet)onChange({...sheet,contextKey,rows:sheet.rows.map(r=>({...r,reviewed:false}))});}},[contextKey]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);onBusy(true);setNotice('');try{await fn();}catch(e){if(alive.current)setNotice(e instanceof Error?e.message:'Please retry.');}finally{if(alive.current){setBusy(false);onBusy(false);}}};
 const patch=(id:string,p:Partial<ComplianceRow>)=>sheet&&onChange({...sheet,sourceChecked:p.comment!==undefined||p.clause!==undefined||p.sourcePage!==undefined||p.kind!==undefined?false:sheet.sourceChecked,rows:sheet.rows.map(r=>r.id===id?{...r,...p,...(p.comment!==undefined?{kind:'requirement' as const,noReplyReason:undefined}:{}),reviewed:p.reviewed??false}:r)});
 const refresh=async()=>{const {data,error}=await db.from('submittal_compliance_library').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(200);if(error)throw error;setSaved(data||[]);};
 const create=()=>void run(async()=>{
  let result=text.trim()?{text,rows:specificationRows(text)}:file?await readSpecification(file,setNotice):null;
  if(!alive.current)return;
  if(!result?.rows.length)throw new Error('Upload a specification or paste its clauses.');
  let source:DocRef|undefined;
  if(file){const id=crypto.randomUUID();await uploadSubmittalFile(`doc:${id}`,file);source={id,name:file.name,type:file.type,size:file.size};}
  if(!alive.current)return;
  const created:ComplianceSheet={id:crypto.randomUUID(),title:file?.name||'Project specification compliance',source,sourceText:result.text,sourceChecked:false,rows:result.rows,contextKey};onChange(created);setParent(undefined);setText('');setFile(undefined);if(input.current)input.current.value='';setNotice('All extracted blocks retained in sequence. Check against the source, exclude unrelated headings with a reason, then confirm the transcription.');
  if(autoReply)await draftSheet(created);
 });
 const draftSheet=async(sheet:ComplianceSheet,onlyId?:string)=>{
  if(!scope.companyId||!scope.brandId)throw new Error('Select the supplier company and brand in project setup first.');
  const pending=sheet.rows.filter(r=>r.included&&requiresReply(r)&&(onlyId?r.id===onlyId:!r.reply.trim()));
  if(!pending.length){setNotice('All included clauses have replies. Use AI regenerate on an individual row if needed.');return;}
  if(pending.some(r=>r.comment.length>6000))throw new Error('Split clauses longer than 6000 characters before drafting. No source text will be truncated.');
  const documents:{id:string;name:string;text:string}[]=[],unread:string[]=[];
  for(const d of docs){try{const cached=evidenceCache.current.get(d.id);if(cached){documents.push(...cached);continue;}setNotice(`Reading current supporting evidence: ${d.name}`);const bytes=await bytesOf(d.id);if(!bytes)throw new Error(`Supporting file unavailable: ${d.name}`);const extracted=await readSpecification(new File([bytes],d.name,{type:d.type}),setNotice);
   // Separate chunks retain the complete extracted document, without silent clipping.
   const chunks:{id:string;name:string;text:string}[]=[];for(let pos=0;pos<extracted.text.length;pos+=23000)chunks.push({id:d.id,name:d.name,text:extracted.text.slice(pos,pos+23000)});evidenceCache.current.set(d.id,chunks);documents.push(...chunks);
  }catch{unread.push(d.name);}}
  if(documents.length>150)throw new Error('Select a smaller set of supporting documents for this compliance sheet.');
  let rows=[...sheet.rows];
  for(let i=0;i<pending.length;i+=5){setNotice(`Drafting clauses ${i+1}–${Math.min(i+5,pending.length)} of ${pending.length}; checking approved library references…`);
   const {data,error}=await supabase.functions.invoke('submittal-assistant',{body:{action:'compliance',message:'Draft specification compliance with current evidence and relevant approved library replies.',comments:pending.slice(i,i+5).map(r=>({id:r.id,comment:r.comment})),documents,fields,scope}});
   if(error||data?.error)throw new Error(data?.error||'AI drafting could not finish. Completed batches are retained. Retry to continue.');
   if(!alive.current)return;
   rows=rows.map(r=>{const a=pending.slice(i,i+5).some(x=>x.id===r.id)&&data.rows?.find((x:{id:string;reply?:string})=>x.id===r.id&&typeof x.reply==='string'&&x.reply.trim());return a?{...r,reply:a.reply,responsibility:a.responsibility,evidence:validateEvidence(a.evidence||[],documents),reviewNote:a.reviewNote,comparison:a.comparison||undefined,reviewed:false}:r;});
   onChange({...sheet,rows,provider:data.provider,contextKey});
   if(pending.slice(i,i+5).some(r=>!data.rows?.some((a:{id:string;reply?:string})=>a.id===r.id&&a.reply?.trim())))throw new Error('AI returned an incomplete batch. Completed replies are retained. Click Generate missing replies with AI to retry.');
  }
  setNotice(`Drafts ready. Review each reply and evidence before issuing.${unread.length?' Supporting files could not be read: '+unread.join(', ')+'. Reattach them before approving affected claims.':''}`);
 };
 const draft=()=>sheet&&void run(()=>draftSheet(sheet));
 const saveLibrary=()=>sheet&&void run(async()=>{
  if(!scope.companyId||!scope.brandId)throw new Error('Select company and brand before saving a reusable sheet.');
  const approved=complianceReady(sheet);
  if(approved && sheet.rows.some(r=>r.included&&r.evidence.some(e=>!docs.some(d=>d.id===e.docId))))throw new Error('A supporting reference is missing. Reattach it or correct the reply before approval.');
  const {data,error}=await db.from('submittal_compliance_library').insert({tenant_id:tenantId,title:sheet.title,scope,sheet,approved,parent_id:parent||null}).select('id').single();if(error)throw error;setParent(data.id);await refresh();setNotice(approved?'Reviewed version saved. Future AI drafts may use these replies as references, subject to current evidence.':'Draft version saved. It will not train future replies until every included clause is reviewed.');
 });
 const exportPdf=async()=>{if(!sheet)return;if(!complianceReady(sheet))throw new Error('Review the source and all included replies before adding the compliance PDF to the submittal.');const bytes=await buildCompliancePdf(sheet,fields,Object.fromEntries(docs.map(d=>[d.id,d.name])),branding);const f=new File([new Uint8Array(bytes)],'Compliance-Statement.pdf',{type:'application/pdf'});{const id=crypto.randomUUID();await uploadSubmittalFile(`doc:${id}`,f);onAttach({id,name:f.name,type:f.type,size:f.size});setNotice('Compliance PDF added to the compliance divider. Regenerate it after any later reply changes.');}};
 return <section id="compliance-editor" className="min-w-0 rounded-2xl border border-primary/25 bg-card p-4 space-y-3">
 <h2 className="text-lg font-bold">Specification → Compliance statement</h2><p className="text-sm text-muted-foreground">Read every page, keep original clauses, draft replies against the proposed product, and save your edited versions for future work.</p>
 <p className="text-xs text-muted-foreground">{standalone?'Save the document':'Save the submittal'} after checking the source and reviewing replies. Future AI drafts automatically consult saved, reviewed compliance replies for the same company, brand and products. Manual and AI-edited wording are both eligible.</p>
 <fieldset disabled={busy} className="min-w-0 space-y-3">
 <ReplyExcelImport kind="compliance" sourceKey={JSON.stringify({sheet,contextKey})} onApply={imported=>{
  if(sheet){const changes=matchImportedReplies(imported.rows,sheet.rows.filter(r=>r.included).map(r=>({...r,number:r.clause,comment:specificationBody(r)})));onChange({...sheet,rows:sheet.rows.map(r=>{const change=changes.find(c=>c.id===r.id);return change?{...r,reply:change.reply,reviewed:false}:r;})});}
  else {onChange({id:crypto.randomUUID(),title:imported.name,sourceText:imported.rows.map(r=>r.number+' '+r.comment).join('\n\n'),sourceChecked:false,contextKey,rows:imported.rows.map(r=>({id:crypto.randomUUID(),clause:r.number,sourcePage:1,included:true,kind:'requirement',comment:specificationComment(r.number,r.comment),reply:r.reply,responsibility:'Supplier',reviewed:false,evidence:[]}))});setParent(undefined);}
 }}/>
 
 <Input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.xlsm,.xls" aria-label="Upload project specification for compliance" onChange={e=>setFile(e.target.files?.[0])}/>
 <p className="text-xs">PDF, scanned PDF, PNG, JPG, Word, Excel, TXT or CSV. Word automatic numbering and embedded images require PDF export. Pasted text takes priority over file extraction.</p>
 <Textarea aria-label="Paste specification clauses" placeholder="Paste the original specification, including clause numbers and sub-points…" value={text} onChange={e=>setText(e.target.value)}/>
 <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoReply} onChange={e=>setAutoReply(e.target.checked)}/>Automatically draft AI replies after reading the specification</label><Button disabled={!file&&!text.trim()} onClick={create}>{sheet?'Start another specification sheet':'Create compliance statement'}</Button>
 <details onToggle={e=>{if(e.currentTarget.open)void run(refresh);}}><summary className="cursor-pointer font-semibold">Master compliance library</summary><Input aria-label="Search compliance library" placeholder="Search saved specifications and replies" value={search} onChange={e=>setSearch(e.target.value)}/><p className="text-xs">Latest 200 versions. Full originals and edits are preserved; only reviewed, matching product versions inform AI replies.</p><div className="max-h-72 overflow-auto space-y-2">{saved.filter(s=>JSON.stringify([s.title,s.sheet.rows]).toLowerCase().includes(search.toLowerCase())).map(s=><div key={s.id} className="border rounded p-2"><p>{s.title} · {s.approved?'Reviewed':'Draft'} · {new Date(s.created_at).toLocaleString()}</p><Button variant="outline" size="sm" disabled={!sameReplyScope(scope,s.scope)} onClick={()=>{onChange({...s.sheet,contextKey,sourceChecked:false,rows:s.sheet.rows.map(r=>({...r,reviewed:false,reusedFrom:s.id}))});setParent(s.id);setNotice('Library version loaded as a draft. Check source, scope and current evidence again.');}}>Open as editable draft</Button></div>)}</div></details>
 {sheet&&<><Input aria-label="Compliance sheet title" value={sheet.title} onChange={e=>onChange({...sheet,title:e.target.value})}/><p className="text-sm">{sheet.rows.length} source blocks · {sheet.rows.filter(r=>r.included).length} included · {sheet.rows.filter(r=>r.included&&r.reviewed).length} reviewed {sheet.provider&&`· ${sheet.provider}`}</p>
 <div className="flex flex-wrap gap-2">{sheet.source&&<Button variant="outline" size="sm" onClick={()=>void run(async()=>{const bytes=await bytesOf(sheet.source!.id);if(!bytes)throw new Error("Original specification unavailable.");download(new Blob([bytes],{type:sheet.source!.type}),sheet.source!.name);})}>Download original specification</Button>}</div><details><summary>Original extracted specification</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{sheet.sourceText}</pre></details>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={sheet.sourceChecked} onChange={e=>onChange({...sheet,sourceChecked:e.target.checked})}/>I checked wording, page coverage, clause sequence and product scope against the source.</label>
 <div className="flex flex-wrap gap-2"><Button onClick={draft}>✨ Generate missing replies with AI</Button><Button variant="outline" onClick={saveLibrary}>Save library version</Button><Button variant="outline" onClick={()=>void run(()=>downloadReviewExcel(complianceExportTables(sheet,fields,sections),'Compliance-Statement.xlsx'))}>Download editable Excel (.xlsx)</Button><ReviewPdfActions disabled={standalone&&!brandingReady} disabledReason="Select company and brand above to apply the correct logos/stamp before PDF export." sourceKey={JSON.stringify({sheet,fields,docs:docs.map(d=>({id:d.id,name:d.name})),branding})} filename="Compliance-Statement.pdf" build={()=>buildCompliancePdf(sheet,fields,Object.fromEntries(docs.map(d=>[d.id,d.name])),branding)}/>{!standalone&&<Button disabled={!complianceReady(sheet)} onClick={()=>void run(()=>exportPdf())}>Add reviewed PDF to submittal</Button>}</div>
 <Button variant="outline" onClick={()=>onChange({...sheet,sourceChecked:false,rows:[...sheet.rows,...specificationRows("New clause — replace with original wording")]})}>Add missing clause</Button>
 <ReplyDocumentHeader title="COMPLIANCE STATEMENT" fields={fields}/>
 <div className="flex flex-wrap gap-2"><Button type="button" variant={tableMode?'default':'outline'} className="min-h-11" aria-pressed={tableMode} onClick={()=>setTableMode(true)}>Row-wise table</Button><Button type="button" variant={!tableMode?'default':'outline'} className="min-h-11" aria-pressed={!tableMode} onClick={()=>setTableMode(false)}>One point at a time</Button></div>
 {!tableMode&&<ReplyWorkbench rows={sheet.rows.filter(r=>r.included).map(r=>({...r,comment:specificationBody(r),label:`Clause ${r.clause||''}`}))} docs={docs} onPatch={(id,p)=>{const current=sheet.rows.find(r=>r.id===id);patch(id,p.comment!==undefined&&current?{...p,comment:specificationComment(current.clause,p.comment)}:p);}} onGenerate={id=>void run(()=>draftSheet(sheet,id))}/>} 
 <div hidden={!tableMode}><ReplyTableSizing sourceWidth={sourceWidth} replyWidth={replyWidth} onSourceWidth={setSourceWidth} onReplyWidth={setReplyWidth}/><div className="rounded-lg border border-blue-300 overflow-hidden">
  <div className="bg-blue-100 p-3 text-slate-900">
   <label className="mt-3 block text-xs font-semibold">Proposed column heading (brand / series)
    <Input className="mt-1 bg-white text-slate-900" value={sheet.proposedTitle??complianceProposedTitle(sheet,fields)} onChange={e=>onChange({...sheet,proposedTitle:e.target.value})}/>
   </label>
  </div>
  <p className="border-y bg-muted px-3 py-2 text-xs">Edit each reply beside its original specification. Clause order is retained. On mobile, swipe the table sideways. Open row details for evidence and review.</p>
  <div role="region" aria-label="Editable specification compliance table" tabIndex={0} className="max-h-[75vh] overflow-auto">
   <table className="table-fixed border-collapse text-sm" style={{width:sourceWidth+replyWidth+100,minWidth:"100%"}}>
    <colgroup><col className="w-[100px]"/><col style={{width:sourceWidth}}/><col style={{width:replyWidth}}/></colgroup>
    <thead className="sticky top-0 z-10 bg-blue-200 text-slate-900"><tr><th scope="col" className="border border-slate-400 p-2 text-left">Clause</th><th scope="col" className="border border-slate-400 p-2 text-left">Specification — original wording</th><th scope="col" className="border border-slate-400 p-2 text-left">{complianceProposedTitle(sheet,fields)}</th></tr></thead>
    <tbody>{sheet.rows.map((r,i)=><tr key={r.id} className={!r.included?'bg-muted text-muted-foreground':r.kind==='heading'?'bg-blue-50 text-slate-900 font-semibold':'bg-background'}>
     <td className="border border-slate-400 p-2 align-top">
      <Input aria-label={`Clause number row ${i+1}`} className="px-1 text-center" value={r.clause} onChange={e=>patch(r.id,{clause:e.target.value,comment:specificationComment(e.target.value,specificationBody(r))})}/>
      <label className="mt-2 block text-xs">Source page<Input type="number" min={1} aria-label={`Source page row ${i+1}`} className="mt-1 px-1" value={r.sourcePage} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>0)patch(r.id,{sourcePage:n});}}/></label>
      <label className="mt-3 flex items-center gap-1 text-xs"><input type="checkbox" checked={r.included} onChange={e=>patch(r.id,{included:e.target.checked})}/>Include</label>
     </td>
     <td className="border border-slate-400 p-2 align-top">
      <Textarea aria-label={`Original specification row ${i+1}`} className="min-h-40 resize-y border-transparent bg-transparent shadow-none focus-visible:border-primary" rows={Math.min(20,Math.max(4,specificationBody(r).split('\n').length+Math.ceil(specificationBody(r).length/65)))} value={specificationBody(r)} onChange={e=>patch(r.id,{comment:specificationComment(r.clause,e.target.value)})}/>
      <details className="mt-2 text-xs"><summary className="cursor-pointer">Clause tools</summary><label className="my-2 flex items-center gap-2"><input type="checkbox" checked={r.kind==='heading'} onChange={e=>patch(r.id,{kind:e.target.checked?'heading':'requirement'})}/>Section heading — no compliance reply required</label><Button variant="ghost" size="sm" onClick={()=>{if(r.reply.trim()||r.evidence.length){setNotice('This clause already has a reply or evidence. Copy them before clearing the reply and evidence to split; existing work will not be discarded.');return;}const parts=specificationRows(r.comment,r.sourcePage);if(parts.length<2){setNotice('Insert a blank line between sub-points, then split this clause.');return;}onChange({...sheet,sourceChecked:false,rows:sheet.rows.flatMap(x=>x.id===r.id?parts.map(p=>({...p,included:r.included,exclusion:r.exclusion})):[x])});}}>Split sub-points</Button></details>
      {!r.included&&<Input aria-label={`Exclusion reason ${i+1}`} placeholder="Reason for excluding this clause" value={r.exclusion||''} onChange={e=>patch(r.id,{exclusion:e.target.value})}/>}
     </td>
     <td className="border border-slate-400 p-2 align-top">
      <Button size="sm" variant="outline" disabled={!r.included||!requiresReply(r)} onClick={()=>void run(()=>draftSheet(sheet,r.id))}>{r.reply.trim()?'✨ AI regenerate reply':'✨ AI write reply'}</Button><Textarea aria-label={`Proposed compliance reply row ${i+1}`} className="min-h-40 resize-y border-transparent bg-transparent shadow-none focus-visible:border-primary" rows={Math.min(20,Math.max(4,r.reply.split('\n').length+Math.ceil(r.reply.length/55)))} placeholder="Write or generate the reply for this specification point…" disabled={!r.included||!requiresReply(r)} value={r.reply} onChange={e=>patch(r.id,{reply:e.target.value})}/>
      {r.included&&requiresReply(r)&&<InlineQuickReplies reply={r.reply} onChange={reply=>patch(r.id,{reply,reviewed:false})}/> }
      <PointDisposition row={r} onChange={p=>patch(r.id,p)}/><label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" disabled={!r.included||!replyPointReady({...r,reviewed:true})} checked={r.reviewed} onChange={e=>patch(r.id,{reviewed:e.target.checked})}/>{requiresReply(r)?'Engineer checked reply and evidence':'Engineer confirmed no reply is required'}</label>
      <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium">Evidence &amp; review {r.evidence.length?`(${r.evidence.length})`:''}</summary>
       <label className="mt-2 block">Responsibility<select aria-label={`Responsibility row ${i+1}`} className="ml-2 rounded border bg-background p-1" value={r.responsibility} onChange={e=>patch(r.id,{responsibility:e.target.value as ComplianceRow['responsibility']})}><option>Supplier</option><option>Contractor</option><option>Joint</option></select></label>
       {r.reviewNote&&<p className="mt-2 whitespace-pre-wrap text-amber-700">{r.reviewNote}</p>}{r.evidence.map((e,j)=><p key={j} className="mt-2 break-words">{docs.find(d=>d.id===e.docId)?.name||'Missing supporting document'}: “{e.quote}”</p>)}
       {r.comparison&&<p className="mt-2">Alternative: {r.comparison.offered} — {r.comparison.justification}</p>}
      </details>
     </td>
    </tr>)}</tbody>
   </table>
  </div>
 </div></div></>}

 </fieldset>{notice&&<p role="status" aria-live="polite" className="text-sm whitespace-pre-wrap">{notice}</p>}
 </section>;
}




function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
