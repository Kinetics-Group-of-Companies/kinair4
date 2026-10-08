import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {PDFDocument, StandardFonts, rgb} from 'npm:pdf-lib@1.17.1';
import {reviewContent,reviewCurrent,stable,safeDocId,retryable,validateSources} from './logic.ts';
declare const EdgeRuntime:{waitUntil:(task:Promise<unknown>)=>void};
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const bucket=db.storage.from('submittal-control');
const clean=(value:unknown,max=180)=>String(value??'').trim().slice(0,max);
const ascii=(s:string)=>s.normalize('NFKD').replace(/[^\x20-\x7E]/g,' ');
async function checked<T>(query:PromiseLike<{data:T;error:any}>){const {data,error}=await query;if(error)throw new Error(error.message);return data;}
async function fingerprint(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
async function recordFor(tenant:string,id:string){const row=await checked(db.from('submittal_lite_records').select('data').eq('tenant_id',tenant).eq('id',id).single());return row.data;}
async function reviewFor(tenant:string,id:string){return await checked(db.from('submittal_internal_reviews').select('*').eq('tenant_id',tenant).eq('record_id',id).maybeSingle());}
async function runPackage(job:any,attempt:string){
 const update=async(patch:any)=>{const rows=await checked(db.from('submittal_package_jobs').update({...patch,updated_at:new Date().toISOString()}).eq('id',job.id).eq('attempt_id',attempt).eq('status','running').select('id'));if(!rows.length)throw new Error('Build attempt no longer active');};
 try{
  const output=await PDFDocument.create();const font=await output.embedFont(StandardFonts.Helvetica);const bold=await output.embedFont(StandardFonts.HelveticaBold);
  const frontCount=Math.ceil(job.sources.length/8);const fronts=Array.from({length:frontCount},()=>output.addPage([595.28,841.89]));
  const ranges:any[]=[];let bytesRead=0;
  for(let i=0;i<job.sources.length;i++){
   const src=job.sources[i];safeDocId(src.document.id);
   if(Number(src.document.size)>30*1024*1024-bytesRead)throw new Error('Package exceeds the 30 MB source limit. Split it into smaller packages.');
   const blob=await checked(bucket.download(`${job.tenant_id}/lite-builder/doc:${src.document.id}`));
   bytesRead+=blob.size;if(bytesRead>30*1024*1024)throw new Error('Package exceeds the 30 MB background build limit. Split it into smaller packages.');
   const pdf=await PDFDocument.load(await blob.arrayBuffer());if(pdf.getPageCount()+output.getPageCount()>600)throw new Error('Package exceeds 600 pages. Split it into smaller packages.');
   const start=output.getPageCount()+1;const copied=await output.copyPages(pdf,pdf.getPageIndices());copied.forEach(p=>output.addPage(p));
   ranges.push({...src,start,end:output.getPageCount()});await update({progress:Math.round((i+1)/job.sources.length*85)});
  }
  for(let k=0;k<frontCount;k++){
   const page=fronts[k];const write=(s:string,x:number,y:number,size=10,strong=false)=>page.drawText(ascii(s),{x,y,size,font:strong?bold:font,color:rgb(.1,.16,.25)});
   const wrap=(s:string,width:number,size=9)=>{const words=ascii(s).split(/\s+/);const lines:string[]=[];let line='';for(const word of words){if(font.widthOfTextAtSize(line+' '+word,size)>width&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
   write('SUBMITTAL PACKAGE / TRANSMITTAL',36,793,16,true);
   wrap(job.title,520,12).slice(0,2).forEach((s,j)=>write(s,36,764-j*16,12,true));
   write(`Package: ${job.id.slice(0,8).toUpperCase()} | ${new Date(job.created_at).toISOString().slice(0,10)}`,36,718);
   wrap(`To: ${job.recipient || 'Not specified'} | Purpose: ${job.purpose}`,520).slice(0,2).forEach((s,j)=>write(s,36,698-j*13));
   write('Reference / revision',42,653,10,true);write('Title / brand',180,653,10,true);write('Package pages',470,653,10,true);
   ranges.slice(k*8,k*8+8).forEach((r,i)=>{const top=638-i*63;page.drawRectangle({x:36,y:top-58,width:523,height:63,borderWidth:.5,borderColor:rgb(.6,.65,.7)});write(`${r.ref} / R${r.rev}`,42,top-18,9);wrap(`${r.title} / ${r.brand}`,280).slice(0,3).forEach((s,j)=>write(s,180,top-15-j*13,9));write(`${r.start}-${r.end}`,480,top-18,9);});
   write('Source PDFs are preserved, including their logos and internal page references.',36,80,9);
   write('Page ranges above refer to this combined package; internal numbering is unchanged.',36,65,9);
   write(`Transmittal ${k+1} / ${frontCount}`,36,40,9);
  }
  const bytes=await output.save();const path=`${job.tenant_id}/lite-builder/shares/${attempt}/Submittal.pdf`;
  await checked(bucket.upload(path,bytes,{contentType:'application/pdf',upsert:false}));
  await update({status:'complete',progress:100,output_path:path,page_count:output.getPageCount(),error:null});
 }catch(error){await db.from('submittal_package_jobs').update({status:'failed',error:clean(error instanceof Error?error.message:error,500),updated_at:new Date().toISOString()}).eq('id',job.id).eq('attempt_id',attempt).eq('status','running');}
}
async function launch(job:any){
 const attempt=crypto.randomUUID();const rows=await checked(db.from('submittal_package_jobs').update({status:'running',attempt_id:attempt,progress:0,error:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('updated_at',job.updated_at).select('*'));
 if(!rows.length)throw new Error('Another build is already starting. Refresh the job list.');
 EdgeRuntime.waitUntil(runPackage(rows[0],attempt));return rows[0];
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:auth,error}=await db.auth.getUser(token);if(error||!auth.user)return reply({error:'Sign in first'},401);
  const profile=await checked(db.from('profiles').select('tenant_id,is_approved').eq('user_id',auth.user.id).single());
  if(!profile?.is_approved)return reply({error:'Approved account required'},403);
  const tenant=profile.tenant_id,user=auth.user.id;const raw=await req.text();if(raw.length>1048576)return reply({error:'Request is too large'},413);const body=JSON.parse(raw);const action=body.action;
  if(action==='members')return reply({members:await checked(db.from('profiles').select('user_id,display_name,email').eq('tenant_id',tenant).eq('is_approved',true)),userId:user});
  if(action==='check_review'||action==='request_review'||action==='decide_review'){
   const id=clean(body.recordId,100);const record=await recordFor(tenant,id);const previous=await reviewFor(tenant,id);
   if(action==='check_review')return reply({allowed:reviewCurrent(previous,record) && (!body.draft || reviewCurrent(previous,body.draft)),review:previous,stale:!!previous&&stable(previous.snapshot)!==stable(reviewContent(record))});
   if(action==='request_review'){
    if(record.issuedPdf)throw new Error('Create a draft revision before requesting an internal review.');
    if(previous && ![previous.requested_by,previous.engineer_id,previous.reviewer_id].includes(user))return reply({error:'Only the existing participants can reassign this review.'},403);
    const engineer=clean(body.engineerId,100),reviewer=clean(body.reviewerId,100);
    if(engineer===reviewer||reviewer===user)throw new Error('Choose a different colleague as reviewer. Self-approval is not allowed.');
    const members=await checked(db.from('profiles').select('user_id').eq('tenant_id',tenant).eq('is_approved',true).in('user_id',[engineer,reviewer]));
    if(members.length!==2)throw new Error('Choose approved engineers from this workspace.');
    const due=clean(body.dueDate,10);if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new Error('Invalid due date');
    const now=new Date().toISOString();const next={record_id:id,tenant_id:tenant,engineer_id:engineer,reviewer_id:reviewer,requested_by:user,due_date:due||null,status:'pending',snapshot:reviewContent(record),history:[...(previous?.history||[]),{at:now,by:user,event:'requested',engineer,reviewer,note:clean(body.note,1500)}],updated_at:now};
    if(previous){const rows=await checked(db.from('submittal_internal_reviews').update(next).eq('record_id',id).eq('tenant_id',tenant).eq('updated_at',previous.updated_at).select('record_id'));if(!rows.length)throw new Error('Review changed. Refresh before retrying.');}
    else await checked(db.from('submittal_internal_reviews').insert(next));
    return reply({review:next});
   }
   if(!previous||previous.reviewer_id!==user)return reply({error:'Only the assigned reviewer can decide.'},403);
   if(previous.status!=='pending'||stable(previous.snapshot)!==stable(reviewContent(record)))throw new Error('Draft changed or review already decided. Request a new review of the saved draft.');
   const status=body.decision;if(!['approved','changes_requested'].includes(status))throw new Error('Invalid decision');
   const note=clean(body.note,1500);if(note.length<10)throw new Error('Record a review note of at least 10 characters.');
   const now=new Date().toISOString();const rows=await checked(db.from('submittal_internal_reviews').update({status,history:[...previous.history,{at:now,by:user,event:status,note}],updated_at:now}).eq('record_id',id).eq('updated_at',previous.updated_at).select('*'));if(!rows.length)throw new Error('Review changed. Refresh before retrying.');return reply({review:rows[0]});
  }
  if(action==='create_package'){
   const ids=Array.isArray(body.recordIds)?body.recordIds:[];if(ids.length<1||ids.length>12||new Set(ids).size!==ids.length)throw new Error('Choose 1-12 unique submittals.');
   const rows=await checked(db.from('submittal_lite_records').select('id,data').eq('tenant_id',tenant).in('id',ids));if(rows.length!==ids.length)throw new Error('A selected submittal is unavailable.');
   const records=ids.map((id:string)=>rows.find((r:any)=>r.id===id)!.data);validateSources(records);
   for(const r of records)if(!reviewCurrent(await reviewFor(tenant,r.id),r))throw new Error(`${r.ref}: internal review is pending or outdated.`);
   const settings=await checked(db.from('submittal_lite_settings').select('data').eq('tenant_id',tenant).maybeSingle());
   const sources=records.map(r=>({id:r.id,ref:r.ref,rev:r.rev,title:r.title,project:r.project,brand:settings?.data?.brands?.find((b:any)=>b.id===r.brandId)?.name||r.brandId,document:r.issuedPdf}));
   const title=clean(body.title)||records[0].project,recipient=clean(body.recipient),purpose=clean(body.purpose,80)||'For consultant review';
   const key=await fingerprint({sources,title,recipient,purpose});const existing=await checked(db.from('submittal_package_jobs').select('*').eq('tenant_id',tenant).eq('created_by',user).eq('fingerprint',key).maybeSingle());
   if(existing)return reply({job:existing});
   const job={id:crypto.randomUUID(),tenant_id:tenant,created_by:user,fingerprint:key,title,recipient,purpose,sources,status:'queued'};
   const created=await checked(db.from('submittal_package_jobs').insert(job).select('*').single());return reply({job:await launch(created)},202);
  }
  if(action==='retry_package'||action==='package_link'){
   const job=await checked(db.from('submittal_package_jobs').select('*').eq('tenant_id',tenant).eq('id',body.jobId).single());
   if(action==='retry_package'){if(job.created_by!==user)return reply({error:'Only the creator can retry this package'},403);if(!retryable(job))throw new Error('This package is complete or still processing.');return reply({job:await launch(job)},202);}
   if(job.status!=='complete'||!job.output_path)throw new Error('Wait for the package to finish.');
   if(job.share_url&&Date.parse(job.share_expires_at)>Date.now()+60000)return reply({signedUrl:job.share_url,expiresAt:job.share_expires_at});
   const signed=await checked(bucket.createSignedUrl(job.output_path,604800));const expiresAt=new Date(Date.now()+604800000).toISOString();
   await checked(db.from('submittal_package_jobs').update({share_url:signed.signedUrl,share_expires_at:expiresAt}).eq('id',job.id).eq('tenant_id',tenant));return reply({signedUrl:signed.signedUrl,expiresAt});
  }
  return reply({error:'Unknown action'},400);
 }catch(error){return reply({error:clean(error instanceof Error?error.message:error,600)},400);}
});
