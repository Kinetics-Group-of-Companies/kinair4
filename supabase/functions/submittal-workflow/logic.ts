export function reviewContent(value: Record<string, unknown>) {
 const next={...value}; for(const key of ['status','history','updatedAt','_expectedUpdatedAt','issuedPdf','issuedLabels','issuedAt'])delete next[key]; return next;
}
export function stable(value: unknown): string {
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value)??'null';
}
export function reviewCurrent(review: {status:string;snapshot:unknown}|null,record:Record<string,unknown>) {return !review || review.status==='approved' && stable(review.snapshot)===stable(reviewContent(record));}
export function safeDocId(value:unknown):string {if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))throw new Error('Invalid issued document reference');return value;}
export function retryable(job:{status:string;updated_at:string},now=Date.now()){return job.status==='failed'||job.status==='queued'||job.status==='running'&&now-Date.parse(job.updated_at)>600000;}
export function validateSources(records: any[]) {
 if(!records.length || records.length>12)throw new Error('Choose between 1 and 12 issued submittals.');
 if(new Set(records.map(r=>r.ref)).size!==records.length)throw new Error('Choose only one revision of each submittal.');
 const projects=new Set(records.map(r=>String(r.project||'').trim().toLowerCase()));
 if(projects.size!==1 || projects.has(''))throw new Error('Package sources must have the same non-empty project name.');
 for(const r of records){if(!r.issuedPdf?.id)throw new Error(`${r.ref}: issue a checked PDF first.`);safeDocId(r.issuedPdf.id);}
}
