import { RtccSupportingDocuments } from './RtccSupportingDocuments';
import { appendRtccAttachments } from '@/lib/submittal-lite/rtcc-attachments';
import { ReplyExcelImport } from './ReplyExcelImport';
import { matchImportedReplies } from '@/lib/submittal-lite/review-import';
import { InlineQuickReplies } from './InlineQuickReplies';
import { ReplyDocumentHeader } from './ReplyDocumentHeader';
import { PointDisposition } from './PointDisposition';
import { requiresReply, replyPointReady } from '@/lib/submittal-lite/reply-points';
import { ReplyWorkbench } from './ReplyWorkbench';
import { ReviewPdfActions } from './ReviewPdfActions';
import { buildReviewPdf, type ReviewPdfBranding } from '@/lib/submittal-lite/review-pdf';
import { ReplyTableSizing } from './ReplyTableSizing';
import {rtccExportTables,downloadReviewExcel} from '@/lib/submittal-lite/review-excel';
import { ReplyBank } from './ReplyBank';
import type { ReplyScope } from '@/lib/submittal-lite/advanced';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/backend/client';
import { extractSetupText, readScannedPage } from '@/lib/submittal-lite/extract';
import { uploadSubmittalFile } from '@/lib/submittal-lite/idb';
import { newRtccRows, rtccNumberingIssue, validateEvidence, rtccCommentBody, type RtccRound, type RtccRow } from '@/lib/submittal-lite/rtcc';
import { readConsultantComments } from '@/lib/submittal-lite/rtcc-read';
import type { DocRef, Field, Section } from '@/lib/submittal-lite/records';
type Props = { standalone?:boolean; tenantId:string; scope:ReplyScope; contextKey?: string; rounds: RtccRound[]; onChange: (rounds: RtccRound[])=>void; fields: Field[]; sections: Section[]; bytesOf: (id:string)=>Promise<ArrayBuffer|undefined>; onSupportAttach:(sectionId:string,doc:DocRef)=>void;onBusy: (busy:boolean)=>void; branding?:ReviewPdfBranding; brandingReady?:boolean };
export function RtccEditor({tenantId,scope,contextKey,rounds,onChange,fields,sections,bytesOf,onBusy,onSupportAttach,standalone=false,branding={},brandingReady=true}:Props) {
 const [tableMode,setTableMode]=useState(true);
 const [sourceWidth,setSourceWidth]=useState(420),[replyWidth,setReplyWidth]=useState(520),[autoReply,setAutoReply]=useState(false);
  const [active,setActive]=useState(rounds[0]?.id || '');
  const [text,setText]=useState(''), [file,setFile]=useState<File>(), [pages,setPages]=useState('all'), [expectedCount,setExpectedCount]=useState('');
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  const [progress,setProgress]=useState('');
  const alive=useRef(true); useEffect(()=>{alive.current=true;return ()=>{alive.current=false;onBusy(false);};},[]);
  const previousContext = useRef(contextKey);
  useEffect(()=>{
    if (previousContext.current !== contextKey) {
      previousContext.current = contextKey;
      if (rounds.some(r=>r.rows.some(row=>row.reviewed))) {
        onChange(rounds.map(r=>({...r,rows:r.rows.map(row=>({...row,reviewed:false}))})));
        setNotice('Project, model or supporting documents changed. Recheck the affected RTCC replies before issuing.');
      }
    }
  },[contextKey]);
  const round=rounds.find(r=>r.id===active) ?? rounds[0];
  const docs=[...new Map(sections.filter(s=>!s.auto).flatMap(s=>s.docs.map(d=>[d.id,d] as const))).values()];
  const changeRound=(value:RtccRound)=>onChange(rounds.map(r=>r.id===value.id?value:r));
  const changeRow=(id:string,patch:Partial<RtccRow>)=>round && changeRound({...round,rows:round.rows.map(r=>r.id===id?{...r,...patch,...(patch.comment!==undefined?{kind:'requirement' as const,noReplyReason:undefined}:{}),reviewed:patch.reviewed ?? false}:r)});
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);onBusy(true);setNotice('');setProgress('Reading consultant comments…');try{await fn();}catch(e){if(alive.current)setNotice(e instanceof Error?e.message:'Please retry.');}finally{if(alive.current){setBusy(false);onBusy(false);setProgress('');}}};
  const addRound=()=>void run(async()=>{
    let source:RtccRound['source'], sourceText=text;
    let finalRows:RtccRow[];
    if(file){
      const result=await readConsultantComments(file,setProgress,pages);
      sourceText=text.trim()||result.text;
      finalRows=text.trim()?newRtccRows(sourceText):result.rows;
      const upload=result.normalizedFile;
      const id=crypto.randomUUID();await uploadSubmittalFile(`doc:${id}`,upload);
      source={id,name:upload.name,type:upload.type,size:upload.size};
    }else finalRows=newRtccRows(sourceText);
    if(!sourceText.trim())throw new Error('Upload consultant comments or paste them first.');
    if(!finalRows.length)throw new Error('No consultant comments could be read. Select the comment page, upload a clearer image, or paste the comments.');
    const issue=rtccNumberingIssue(finalRows);if(issue)throw new Error(issue);
    if(expectedCount.trim()&&finalRows.length!==Number(expectedCount))throw new Error(`Expected ${expectedCount} main comments but read ${finalRows.length}. Check selected pages or paste corrected comments. No RTCC round was created.`);
    if(!alive.current)return;
    const created:RtccRound={id:crypto.randomUUID(),number:Math.max(0,...rounds.map(r=>r.number))+1,date:new Date().toISOString(),source,sourceText,rows:finalRows,provider:'KINAIR local engine'};
    onChange([created,...rounds]);setActive(created.id);setText('');setFile(undefined);setPages('all');setExpectedCount('');if(fileInput.current)fileInput.current.value='';
    setNotice(`${created.rows.length} main comments extracted. Check the count and original numbering against the source before drafting. Form headings and review/signature blocks are excluded.`);
    if(autoReply)await draftRound(created,[created,...rounds]);
  });
  const draftRound=async(round:RtccRound,baseRounds:RtccRound[]=rounds,onlyId?:string)=>{
    const pending=round.rows.filter(r=>requiresReply(r)&&r.comment.trim()&&(onlyId?r.id===onlyId:!r.reply.trim()));
    if(!pending.length){setNotice('Local replies are ready. Review them or clear a reply to request AI drafting.');return;}
    const documents:{id:string;name:string;text:string}[]=[]; const unread:string[]=[];
    // Read actual attached documents, not model names or library filenames as evidence.
    for(const d of docs){
      setProgress(`Reading supporting document ${documents.length+unread.length+1} of ${docs.length}…`);
      try{const bytes=await bytesOf(d.id);if(!bytes){unread.push(d.name);continue;}const extracted=await extractSetupText(new File([bytes],d.name,{type:d.type}),readScannedPage);documents.push({id:d.id,name:d.name,text:extracted.slice(0,24000)});}catch{unread.push(d.name);}
      if(!alive.current)return;
    }
    let rows=[...round.rows], provider='KINAIR local engine';
    // Small batches keep retries inexpensive and retain comment identity/order.
    for(let n=0;n<pending.length;n+=5){
      setProgress(`Drafting replies ${n+1}–${Math.min(n+5,pending.length)} of ${pending.length}…`);
      const comments=pending.slice(n,n+5).map(r=>({id:r.id,comment:r.comment}));
      const {data,error}=await supabase.functions.invoke('submittal-assistant',{body:{action:'rtcc',message:'Draft evidence-grounded replies to these consultant comments.',comments,documents,fields,scope}});
      if(error||data?.error){const detail=error?.context instanceof Response?await error.context.json().catch(()=>null):null;throw new Error(data?.error || detail?.error || 'AI reply drafting failed. Your comments and completed replies remain available; tap Draft remaining replies to retry.');}
      if(!alive.current)return;
      provider=data.provider || provider;
      rows=rows.map(row=>{const answer=pending.slice(n,n+5).some(r=>r.id===row.id)&&data.rows?.find((a:{id:string;reply?:string})=>a.id===row.id&&typeof a.reply==='string'&&a.reply.trim());if(!answer)return row;
        const evidence=validateEvidence(answer.evidence||[],documents);
        return {...row,reply:answer.reply||row.reply,responsibility:answer.responsibility||row.responsibility,evidence,comparison:answer.comparison||undefined,reviewNote:answer.reviewNote||'Verify reply and evidence before marking reviewed.',reviewed:false};});
      onChange(baseRounds.map(r=>r.id===round.id?{...r,rows,provider}:r));
      if(pending.slice(n,n+5).some(r=>!data.rows?.some((a:{id:string;reply?:string})=>a.id===r.id&&a.reply?.trim())))throw new Error('AI returned an incomplete batch. Completed replies are retained. Click Generate missing replies with AI to retry.');
    }
    setNotice(`Draft replies ready (${provider}). ${unread.length ? 'Could not read: '+unread.join(', ')+'. ' : ''}Review claims, responsibility and evidence before sharing.`);
  };
  const draft=()=>round&&void run(()=>draftRound(round));
  return <section id="rtcc-editor" className="min-w-0 max-w-full break-words space-y-4 rounded-2xl border border-primary/25 bg-card p-4 shadow-clay-sm">
    <div><h2 className="text-lg font-bold">Consultant comments & RTCC</h2><p className="text-sm text-muted-foreground">Upload comments for this revision. Latest round appears before the cover; earlier rounds are retained. Save with the submittal.</p></div>
    <p className="text-xs text-muted-foreground">{standalone?'Save the document':'Save the submittal'} after reviewing replies. Future AI drafts automatically consult saved, reviewed RTCC replies for the same company, brand and products. Manual and AI-edited wording are both eligible.</p>
    <fieldset disabled={busy} className="min-w-0 space-y-3">
 <ReplyExcelImport kind="rtcc" sourceKey={JSON.stringify({round,contextKey})} onApply={imported=>{
  if(round){const number=/^RTCC\s+(\d+)/i.exec(imported.name);if(number&&Number(number[1])!==round.number)throw new Error('Select the matching RTCC round before importing.');const changes=matchImportedReplies(imported.rows,round.rows.map((r,i)=>({...r,number:r.sourceNumber||String(i+1),comment:rtccCommentBody(r)})));changeRound({...round,rows:round.rows.map(r=>{const change=changes.find(c=>c.id===r.id);return change?{...r,reply:change.reply,reviewed:false}:r;})});}
  else {const created:RtccRound={id:crypto.randomUUID(),number:Number(/^RTCC\s+(\d+)/i.exec(imported.name)?.[1])||1,date:new Date().toISOString(),sourceText:imported.rows.map(r=>r.number+' '+r.comment).join('\n\n'),rows:imported.rows.map(r=>({id:crypto.randomUUID(),sourceNumber:r.number,kind:'requirement',comment:r.comment,reply:r.reply,responsibility:'Supplier',reviewed:false,evidence:[]}))};onChange([created]);setActive(created.id);}
 }}/>
 
      <div className="rounded-xl bg-muted/40 p-3 space-y-2"><p className="text-sm font-semibold">1. Add consultant comments</p>
        <Input ref={fileInput} className="min-w-0 max-w-full" type="file" accept=".pdf,.png,.jpg,.jpeg" aria-label="Upload consultant comments" onChange={e=>{setFile(e.target.files?.[0]);setPages('all');setNotice('');}}/>
        {file && <p className="break-all text-xs">Selected: {file.name}</p>}
        {file && /\.pdf$/i.test(file.name) && <label className="block text-sm">Consultant comment pages only (PDF)<Input value={pages} onChange={e=>setPages(e.target.value)} placeholder="all or 1-3,5"/><span className="text-xs text-muted-foreground">All pages are included by default. If this PDF contains the full submittal, enter only the comment page numbers.</span></label>}
        <Textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Or paste consultant comments here. Pasted text overrides PDF extraction." aria-label="Paste consultant comments"/>
        <label className="block text-sm">Main comment count (optional cross-check)<Input type="number" min={1} value={expectedCount} onChange={e=>setExpectedCount(e.target.value)} placeholder="e.g. 14"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoReply} onChange={e=>setAutoReply(e.target.checked)}/>Automatically draft AI replies after reading comments</label><Button onClick={addRound} disabled={!file&&!text.trim()}>{busy?'Working…':`Create RTCC ${String(Math.max(0,...rounds.map(r=>r.number))+1).padStart(2,'0')}`}</Button>
      </div>
      {!!rounds.length && <><div className="flex flex-wrap gap-2">{round&&<Button variant="outline" onClick={()=>void run(()=>downloadReviewExcel(rtccExportTables([round],fields,sections),`RTCC-${String(round.number).padStart(2,'0')}-Editable.xlsx`))}>Download selected RTCC Excel</Button>}<Button variant="outline" onClick={()=>void run(()=>downloadReviewExcel(rtccExportTables(rounds,fields,sections),'Reply-to-Consultant-Comments.xlsx'))}>Download all RTCC rounds</Button></div><div className="flex flex-wrap gap-2">{[...rounds].sort((a,b)=>b.number-a.number).map(r=><Button key={r.id} variant={active===r.id?'default':'outline'} onClick={()=>setActive(r.id)}>RTCC {String(r.number).padStart(2,'0')} · {r.rows.length} comments</Button>)}</div>
      {round && <><ReviewPdfActions disabled={standalone&&!brandingReady} disabledReason="Select company and brand above to apply the correct logos/stamp before PDF export." sourceKey={JSON.stringify({round,fields,sections,branding})} filename={`RTCC-${String(round.number).padStart(2,'0')}.pdf`} build={async()=>appendRtccAttachments(await buildReviewPdf(rtccExportTables([round],fields,sections),branding),[round],async id=>{const ref=docs.find(d=>d.id===id),bytes=await bytesOf(id);return ref&&bytes?{id,bytes,type:ref.type,name:ref.name}:undefined;})}/><p className="text-xs text-muted-foreground">Preview and PDF download show the selected RTCC reply, comparison sheets and supporting files in comment order. The combined submittal also includes original consultant comments and final page references.</p><details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Saved reply library</summary><ReplyBank key={`${round.id}:${contextKey}`} tenantId={tenantId} scope={scope} rows={round.rows} docs={docs} bytesOf={bytesOf} onBusy={value=>{setBusy(value);onBusy(value);}} onReuse={next=>changeRow(next.id,next)}/></details><div className="flex flex-wrap items-center gap-2"><Button onClick={draft}>✨ Generate missing replies with AI</Button><Button variant="outline" onClick={()=>changeRound({...round,rows:[...round.rows,{id:crypto.randomUUID(),comment:'',reply:'',responsibility:'Joint',reviewed:false,evidence:[]}]})}>Add comment</Button><span className="text-xs">{round.rows.filter(r=>r.reviewed).length}/{round.rows.length} reviewed · {round.provider}</span></div>
      <details><summary className="cursor-pointer text-sm">Extracted source text — cross-check against original</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{round.sourceText}</pre></details>
      <ReplyDocumentHeader title={`RTCC ${String(round.number).padStart(2,'0')} | Reply to Consultant Comments`} fields={fields}/>
 <div className="flex flex-wrap gap-2"><Button type="button" variant={tableMode?'default':'outline'} className="min-h-11" aria-pressed={tableMode} onClick={()=>setTableMode(true)}>Row-wise table</Button><Button type="button" variant={!tableMode?'default':'outline'} className="min-h-11" aria-pressed={!tableMode} onClick={()=>setTableMode(false)}>One point at a time</Button></div>
      {!tableMode&&<ReplyWorkbench key={round.id} rows={round.rows.map((r,i)=>({...r,label:`Comment ${r.sourceNumber||i+1}`}))} docs={docs} onPatch={changeRow} onGenerate={id=>void run(()=>draftRound(round,rounds,id))}/>}
      {!tableMode&&<details><summary className="cursor-pointer py-3 font-semibold">Supporting documents by comment</summary>{round.rows.map((r,i)=><RtccSupportingDocuments key={r.id} comment={r.sourceNumber||String(i+1)} ids={r.supportingDocIds||[]} docs={docs} onChange={ids=>changeRow(r.id,{supportingDocIds:ids})} onAttach={doc=>onSupportAttach('new',doc)} onBusy={b=>{setBusy(b);onBusy(b);}}/>)}</details>}
      <div hidden={!tableMode}><ReplyTableSizing sourceWidth={sourceWidth} replyWidth={replyWidth} onSourceWidth={setSourceWidth} onReplyWidth={setReplyWidth}/><div className="rounded-lg border border-blue-300 overflow-hidden">

       <p className="border-y bg-muted px-3 py-2 text-xs">Edit each reply beside its original consultant comment. Original numbering is retained. On mobile, swipe the table sideways. Open row details for evidence and review.</p>
       <div className="max-h-[75vh] overflow-auto" tabIndex={0} role="region" aria-label="RTCC editing table"><table className="table-fixed border-collapse text-sm" style={{width:sourceWidth+replyWidth+100,minWidth:"100%"}}><colgroup><col className="w-[100px]"/><col style={{width:sourceWidth}}/><col style={{width:replyWidth}}/></colgroup>
        <thead className="sticky top-0 z-10 bg-blue-200 text-slate-900"><tr><th scope="col" className="border border-slate-400 p-2 text-left">No.</th><th className="border border-slate-400 p-2 text-left">Consultant comments</th><th className="border border-slate-400 p-2 text-left">Reply to Consultant comments</th></tr></thead>
        {round.rows.map((r,i)=><tbody key={r.id}><tr className={r.kind==='heading'?'bg-blue-50 text-slate-900 font-semibold':'bg-background'}>
         <td className="border border-slate-400 p-2 text-center align-top"><Input aria-label={`Comment number row ${i+1}`} className="px-1 text-center" value={r.sourceNumber??String(i+1)} onChange={e=>changeRow(r.id,{sourceNumber:e.target.value})}/></td>
         <td className="border border-slate-400 p-2 align-top"><Textarea aria-label={`Consultant comment ${r.sourceNumber||i+1}`} className="min-h-40 resize-y border-transparent bg-transparent shadow-none focus-visible:border-primary" rows={Math.min(20,Math.max(4,rtccCommentBody(r).split('\n').length+Math.ceil(rtccCommentBody(r).length/65)))} value={rtccCommentBody(r)} onChange={e=>changeRow(r.id,{comment:e.target.value})}/></td>
         <td className="border border-slate-400 p-2 align-top"><Button size="sm" variant="outline" disabled={!requiresReply(r)||!r.comment.trim()} onClick={()=>void run(()=>draftRound(round,rounds,r.id))}>{r.reply.trim()?'✨ AI regenerate reply':'✨ AI write reply'}</Button><Textarea aria-label={`Reply to consultant comment ${r.sourceNumber||i+1}`} className="min-h-40 resize-y border-transparent bg-transparent shadow-none focus-visible:border-primary" rows={Math.min(20,Math.max(4,r.reply.split('\n').length+Math.ceil(r.reply.length/55)))} disabled={!requiresReply(r)} value={r.reply} onChange={e=>changeRow(r.id,{reply:e.target.value})} placeholder="Write or generate the reply for this consultant comment…"/>
        {requiresReply(r)&&<InlineQuickReplies reply={r.reply} onChange={reply=>changeRow(r.id,{reply,reviewed:false})}/> }
      <RtccSupportingDocuments comment={r.sourceNumber||String(i+1)} ids={r.supportingDocIds||[]} docs={docs} onChange={ids=>changeRow(r.id,{supportingDocIds:ids})} onAttach={doc=>onSupportAttach('new',doc)} onBusy={b=>{setBusy(b);onBusy(b);}}/>
      <PointDisposition row={r} onChange={p=>changeRow(r.id,p)}/><label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={r.reviewed} disabled={!replyPointReady({...r,reviewed:true})} onChange={e=>changeRow(r.id,{reviewed:e.target.checked})}/>{requiresReply(r)?'Engineer checked reply and evidence':'Engineer confirmed no reply is required'}</label>
        <details className="mt-2 text-xs"><summary className="min-h-11 cursor-pointer py-3 font-medium">Evidence &amp; review {r.evidence.length?`(${r.evidence.length})`:''}</summary><div className="space-y-2 pt-2">
        <Button size="sm" variant="ghost" onClick={()=>changeRound({...round,rows:round.rows.filter(x=>x.id!==r.id)})}>Remove row</Button>

        <label className="block text-xs">Responsibility <select className="rounded border bg-background p-2" value={r.responsibility} onChange={e=>changeRow(r.id,{responsibility:e.target.value as RtccRow['responsibility']})}>{['Supplier','Contractor','Joint'].map(v=><option key={v}>{v}</option>)}</select></label>
        {r.reviewNote && <p className="text-xs text-amber-700">{r.reviewNote}</p>}
        {r.evidence.map((e,j)=><div key={j} className="rounded bg-muted p-2 text-xs">{docs.find(d=>d.id===e.docId)?.name||'Missing document'} — “{e.quote}” <Input aria-label="Exact evidence quotation" value={e.quote} onChange={event=>changeRow(r.id,{evidence:r.evidence.map((item,n)=>n===j?{...item,quote:event.target.value}:item)})}/> <button type="button" onClick={()=>changeRow(r.id,{evidence:r.evidence.filter((_,n)=>n!==j)})}>Remove reference</button></div>)}
        <select aria-label={`Supporting document for comment ${i+1}`} className="w-full rounded border bg-background p-2 text-xs" value="" onChange={e=>{if(e.target.value)changeRow(r.id,{evidence:[...r.evidence,{docId:e.target.value,quote:'Engineer-selected reference'}]});}}><option value="">Add supporting document — page reference added automatically</option>{docs.filter(d=>!r.evidence.some(e=>e.docId===d.id)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <details open={!!r.comparison}><summary className="cursor-pointer text-xs" onClick={()=>{if(!r.comparison)changeRow(r.id,{comparison:{requirement:r.comment,offered:'',justification:''}});}}>Alternative / comparison sheet</summary>{r.comparison && <div className="grid gap-2 pt-2"><Input aria-label="Specified requirement" value={r.comparison.requirement} onChange={e=>changeRow(r.id,{comparison:{...r.comparison!,requirement:e.target.value}})}/><Input aria-label="Offered alternative" placeholder="Actual offered material / parameter" value={r.comparison.offered} onChange={e=>changeRow(r.id,{comparison:{...r.comparison!,offered:e.target.value}})}/><Textarea aria-label="Alternative justification" placeholder="Evidence-based advantages and differences; subject to consultant approval" value={r.comparison.justification} onChange={e=>changeRow(r.id,{comparison:{...r.comparison!,justification:e.target.value}})}/><Button variant="ghost" size="sm" onClick={()=>changeRow(r.id,{comparison:undefined})}>Remove comparison</Button></div>}</details>


        </div></details></td></tr></tbody>)}</table></div></div></div></>}

      </>}
    </fieldset>
    {busy && <p role="status" aria-live="polite" className="text-sm font-medium">{progress}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>;
}




