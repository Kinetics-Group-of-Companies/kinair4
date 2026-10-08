import { supabase as client } from '@/integrations/backend/client';
import type { SubmittalRecord } from './records';
export async function workflowAction<T = any>(body: Record<string,unknown>):Promise<T> {
 const {data,error}=await client.functions.invoke('submittal-workflow',{body});
 if(error){let message=error.message;try{const payload=await error.context?.json();if(payload?.error)message=payload.error;}catch{/* use transport error */}throw new Error(message);}
 if(data?.error)throw new Error(data.error);return data as T;
}
export async function assertInternalReview(record:SubmittalRecord,draft?:SubmittalRecord) {
 const result=await workflowAction<{allowed:boolean}>({action:'check_review',recordId:record.id,draft});
 if(!result.allowed)throw new Error('Internal review is pending or outdated. Save the current draft and request approval from the assigned reviewer.');
}
export function packageLink(signedUrl:string){
 const token=new URL(signedUrl).searchParams.get('token');if(!token)throw new Error('Could not prepare the branded link.');
 return `${window.location.origin}/kinair-submittal?preview=2#${token}`;
}
export function reviewIsStale(snapshot:Record<string,unknown>,record:SubmittalRecord) {
 const content=JSON.parse(JSON.stringify(record));
 for(const key of ['status','history','updatedAt','_expectedUpdatedAt','issuedPdf','issuedLabels','issuedAt'])delete content[key];
 const canonical=(value:any):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
 return canonical(snapshot)!==canonical(content);
}
