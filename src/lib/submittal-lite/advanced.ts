import type { SubmittalRecord } from './records';
import type { RtccRow } from './rtcc';
import { validateEvidence } from './rtcc';
export type ReplyScope = { companyId:string; brandId:string; seriesIds:string[]; customProducts:string[] };
export type SavedReply = { id:string; tenant_id:string; scope:ReplyScope; row:RtccRow; applicability:string; created_at:string; created_by:string };
const sorted=(a:string[])=>JSON.stringify([...a].sort());
export function sameReplyScope(a:ReplyScope,b:ReplyScope) {
  return !!a.companyId && !!a.brandId && a.companyId===b.companyId && a.brandId===b.brandId && sorted(a.seriesIds)===sorted(b.seriesIds) && sorted(a.customProducts||[])===sorted(b.customProducts||[]);
}
export function reuseReply(saved:SavedReply,scope:ReplyScope,target:RtccRow,documents:{id:string;text:string}[]):RtccRow {
  if(!sameReplyScope(saved.scope,scope))throw new Error('Company, brand or product selection differs. This reply cannot be reused.');
  if(!saved.row.evidence.length || validateEvidence(saved.row.evidence,documents).length!==saved.row.evidence.length)throw new Error('Supporting evidence is missing or changed. Attach and verify the original evidence before reusing this reply.');
  return {...target,reply:saved.row.reply,responsibility:saved.row.responsibility,evidence:saved.row.evidence,comparison:saved.row.comparison,reviewed:false,reviewNote:`Reused approved reply (${saved.id}). Recheck applicability: ${saved.applicability}`};
}
export type RevisionChange={area:string;before:string;after:string};
export function compareRevisions(before:SubmittalRecord,after:SubmittalRecord):RevisionChange[] {
  const result:RevisionChange[]=[];
  const add=(area:string,a:unknown,b:unknown)=>{const x=typeof a==='string'?a:JSON.stringify(a??null,null,2),y=typeof b==='string'?b:JSON.stringify(b??null,null,2);if(x!==y)result.push({area,before:x||'—',after:y||'—'});};
  for(const key of ['title','project','kind','status','companyId','brandId','seriesIds','customProducts','coverHeading','indexMode','useDefaultCover','useDefaultIndex','coverText','indexText','stampAll','stampCover','stampIndex','technicalIssues'] as const)add(key,before[key],after[key]);
  const fieldMap=(r:SubmittalRecord)=>new Map(r.fields.map((f,i)=>[`${f.label} (${r.fields.slice(0,i).filter(p=>p.label===f.label).length+1})`,f.value]));
  const af=fieldMap(before),bf=fieldMap(after);for(const label of new Set([...af.keys(),...bf.keys()]))add(`Project detail · ${label}`,af.get(label),bf.get(label));
  add('Cover document',before.coverDoc,after.coverDoc);add('Client index document',before.indexDoc,after.indexDoc);
  add('Divider order',before.sections.map(s=>s.title),after.sections.map(s=>s.title));
  for(const id of new Set([...before.sections,...after.sections].map(s=>s.id))){const a=before.sections.find(s=>s.id===id),b=after.sections.find(s=>s.id===id);add(`Divider · ${b?.title||a?.title}`,a&&{title:a.title,stamp:a.stamp,auto:a.auto},b&&{title:b.title,stamp:b.stamp,auto:b.auto});add(`Documents · ${b?.title||a?.title}`,a?.docs.map(d=>({id:d.id,name:d.name})),b?.docs.map(d=>({id:d.id,name:d.name})));}
  for(const id of new Set([...(before.rtcc||[]),...(after.rtcc||[])].map(r=>r.id))){const a=before.rtcc?.find(r=>r.id===id),b=after.rtcc?.find(r=>r.id===id);add(`RTCC ${b?.number||a?.number} · source`,a&&{source:a.source,text:a.sourceText},b&&{source:b.source,text:b.sourceText});for(const rowId of new Set([...(a?.rows||[]),...(b?.rows||[])].map(r=>r.id))){const ar=a?.rows.find(r=>r.id===rowId),br=b?.rows.find(r=>r.id===rowId);add(`RTCC ${b?.number||a?.number} · ${br?.comment||ar?.comment}`,ar,br);}}
  return result;
}
export type UsageEvent={id:string;created_at:string;request_id:string;action:string;provider:string;model:string;outcome:string;input_tokens:number|null;output_tokens:number|null;latency_ms:number};
export type UsageRate={provider:string;model:string;input_usd:number;output_usd:number};
export function summarizeUsage(events:UsageEvent[],rates:UsageRate[]) {
  const groups=new Map<string,{provider:string;model:string;calls:number;failed:number;input:number;output:number;unknown:number;unpriced:number;estimate:number}>();
  for(const e of events){const key=JSON.stringify([e.provider,e.model]);const g=groups.get(key)||{provider:e.provider,model:e.model,calls:0,failed:0,input:0,output:0,unknown:0,unpriced:0,estimate:0};g.calls++;if(e.outcome==='error')g.failed++;g.input+=e.input_tokens??0;g.output+=e.output_tokens??0;const rate=rates.find(r=>r.provider===e.provider&&r.model===e.model);if(e.input_tokens===null||e.output_tokens===null)g.unknown++;else if(!rate)g.unpriced++;else g.estimate+=(e.input_tokens*rate.input_usd+e.output_tokens*rate.output_usd)/1e6;groups.set(key,g);}
  return [...groups.values()];
}
