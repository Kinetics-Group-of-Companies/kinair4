import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/backend/client';
import type { ReplyScope } from './advanced';
import type { ComplianceSheet } from './compliance';
import { complianceReady } from './compliance';
import { rtccReady, type RtccRound } from './rtcc';
import type { DocRef, Field, Section, SubmittalRecord } from './records';
export type ReplyDocumentKind='compliance'|'rtcc';
export type ReplyDocument={id:string;kind:ReplyDocumentKind;title:string;scope:ReplyScope;originRef?:string;fields:Field[];sections:Section[];compliance?:ComplianceSheet;rtcc:RtccRound[]};
export type SavedReplyDocument={id:string;kind:ReplyDocumentKind;title:string;data:ReplyDocument;version:number;updated_at:string};
const db=supabase as unknown as SupabaseClient;
export async function loadReplyDocuments(tenantId:string){
 const {data,error}=await db.from('submittal_reply_documents').select('id,kind,title,data,version,updated_at').eq('tenant_id',tenantId).order('updated_at',{ascending:false}).limit(1000);
 if(error)throw error;return (data||[]) as SavedReplyDocument[];
}
export async function saveReplyDocument(tenantId:string,document:ReplyDocument,version?:number):Promise<SavedReplyDocument>{
 const row={id:document.id,tenant_id:tenantId,kind:document.kind,title:document.title,data:document,version:(version||0)+1,updated_at:new Date().toISOString()};
 const request=version?db.from('submittal_reply_documents').update(row).eq('id',document.id).eq('tenant_id',tenantId).eq('version',version):db.from('submittal_reply_documents').insert(row);
 const {data,error}=await request.select('id,kind,title,data,version,updated_at');if(error)throw error;
 if(!data?.length)throw new Error('This document changed in another session. Your work has not been overwritten. Refresh the saved list and reopen the latest version.');return data[0] as SavedReplyDocument;
}
export function newReplyDocument(kind:ReplyDocumentKind):ReplyDocument{return {id:crypto.randomUUID(),kind,title:kind==='compliance'?'Compliance statement':'Reply to consultant comments',scope:{companyId:'',brandId:'',seriesIds:[],customProducts:[]},fields:['Project Name','Client Name','MEP Consultant','Main Contractor','MEP Contractor','Supplier Name','Brand Name'].map(label=>({label,value:''})),sections:[],rtcc:[]};}
export function replyDocumentReady(doc:ReplyDocument){return doc.kind==='compliance'?!!doc.compliance&&complianceReady(doc.compliance):doc.rtcc.length>0&&rtccReady(doc.rtcc);}
export function searchReplyTargets(records:SubmittalRecord[],query:string){const q=query.trim().toLowerCase();return records.filter(r=>[r.ref,r.title,r.project,r.issuedPdf?.name,...r.sections.flatMap(s=>s.docs.map(d=>d.name))].some(v=>v?.toLowerCase().includes(q)));}
export function mergeReplyDocument(doc:ReplyDocument,target:SubmittalRecord,records:SubmittalRecord[],pdf?:DocRef,replaceCompliance=false):SubmittalRecord{
 if(!replyDocumentReady(doc))throw new Error('Review the source and all replies before merging.');
 if(doc.scope.companyId!==target.companyId||doc.scope.brandId!==target.brandId)throw new Error('Supplier or brand differs. Use the target project setup, then recheck the replies.');
 const project=(fields:Field[])=>fields.find(f=>/^(project|project name)$/i.test(f.label.trim()))?.value.trim().toLowerCase()||'';
 if(project(doc.fields)!==project(target.fields))throw new Error('Project names differ. Correct the document project details and review again before merging.');
 if(target.replyDocumentIds?.includes(doc.id))throw new Error('This document is already merged into this revision. Create a new standalone document for another issue.');
 if(doc.kind==='compliance'&&target.compliance&&!replaceCompliance)throw new Error('This submittal already has a compliance statement. Confirm replacement first.');
 if(doc.kind==='compliance'&&!pdf)throw new Error('Build the reviewed compliance PDF before merging.');
 const oldPdf=doc.kind==='compliance'?target.compliance?.generatedDocId:undefined;
 let sections=target.sections.map(s=>({...s,docs:s.docs.filter(d=>d.id!==oldPdf)}));
 const existing=new Set(sections.flatMap(s=>s.docs.map(d=>d.id)));
 const usedIds=new Set(doc.rtcc.flatMap(r=>r.rows.flatMap(row=>[...(row.supportingDocIds||[]),...row.evidence.map(e=>e.docId)])));
 const extra=doc.sections.filter(s=>!s.auto).flatMap(s=>s.docs).filter(d=>d.id!==doc.compliance?.generatedDocId&&!existing.has(d.id)&&(doc.kind!=='rtcc'||usedIds.has(d.id)));
 const unique=[...new Map(extra.map(d=>[d.id,d])).values()];
 if(unique.length)sections.push({id:crypto.randomUUID(),title:'SUPPORTING DOCUMENTS — '+doc.title,docs:unique,stamp:'none'});
 const allDocs=new Set(sections.filter(s=>!s.auto).flatMap(s=>s.docs.map(d=>d.id)));
 const rows=doc.kind==='compliance'?doc.compliance!.rows.filter(r=>r.included):doc.rtcc.flatMap(r=>r.rows);
 if(rows.some(r=>r.evidence.some(e=>!allDocs.has(e.docId))||(r.supportingDocIds||[]).some(id=>!allDocs.has(id))))throw new Error('A referenced supporting document is missing. Attach it before merging.');
 if(pdf){const section=sections.find(s=>!s.auto&&/compliance/i.test(s.title));sections=section?sections.map(s=>s.id===section.id?{...s,notApplicableReason:undefined,docs:[...s.docs,pdf]}:s):[...sections,{id:crypto.randomUUID(),title:'COMPLIANCE STATEMENT',docs:[pdf],stamp:'none'}];}
 const now=new Date().toISOString(),issued=!!target.issuedPdf;
 const next:SubmittalRecord={...target,id:issued?crypto.randomUUID():target.id,rev:issued?Math.max(target.rev,...records.filter(r=>r.ref===target.ref).map(r=>r.rev))+1:target.rev,issuedPdf:undefined,issuedLabels:undefined,issuedAt:undefined,status:'Draft',sections,updatedAt:now,createdAt:issued?now:target.createdAt,replyDocumentIds:[...(target.replyDocumentIds||[]),doc.id],history:[...target.history,{status:'Draft',at:now,note:`Merged standalone ${doc.kind}: ${doc.title}${issued?' into a new revision':''}`} ]};
 if(doc.kind==='compliance')next.compliance={...doc.compliance!,generatedDocId:pdf!.id};
 else {let number=Math.max(0,...(target.rtcc||[]).map(r=>r.number));const existing=target.rtcc||[];const replaceIds=new Set(doc.originRef===target.ref?doc.rtcc.map(r=>r.id):[]);next.rtcc=existing.map(r=>replaceIds.has(r.id)?{...doc.rtcc.find(x=>x.id===r.id)!,number:r.number}:r);for(const round of [...doc.rtcc].sort((a,b)=>a.number-b.number)){if(doc.originRef===target.ref&&existing.some(r=>r.id===round.id))continue;next.rtcc.push({...round,id:crypto.randomUUID(),number:++number});}}
 return next;
}
