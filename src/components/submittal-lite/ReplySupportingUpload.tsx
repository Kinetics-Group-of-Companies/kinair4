import { useState } from 'react';
import { uploadSubmittalFile } from '@/lib/submittal-lite/idb';
import type { DocRef, Section } from '@/lib/submittal-lite/records';
export function ReplySupportingUpload({sections,onAttach,onBusy}:{sections:Section[];onAttach:(sectionId:string,doc:DocRef)=>void;onBusy:(busy:boolean)=>void}){
 const [target,setTarget]=useState('new'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const available=sections.filter(s=>!s.auto&&!/specification|compliance/i.test(s.title));
 return <div className="rounded-xl border p-3 space-y-2"><h3 className="font-semibold">Supporting documents</h3>
 <p className="text-sm">Upload product data, certificates, drawings or other evidence as PDF, PNG or JPG. Files become available to AI drafting and row evidence references. Save the submittal to retain attachments.</p>
 <label className="block text-sm">Attach to section <select aria-label="Supporting document section" className="min-h-11 max-w-full rounded border bg-background p-2" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}><option value="new">Supporting documents</option>{available.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
 <input aria-label="Upload supporting documents" className="min-h-11 max-w-full text-sm" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={async e=>{
  const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;
  if(files.some(f=>! /\.(pdf|png|jpe?g)$/i.test(f.name))){setNotice('Choose PDF, PNG or JPG files.');return;}
  setBusy(true);onBusy(true);let done=0;
  try{for(const file of files){setNotice(`Uploading ${done+1} of ${files.length}: ${file.name}`);const id=crypto.randomUUID();const type=/\.pdf$/i.test(file.name)?'application/pdf':/\.png$/i.test(file.name)?'image/png':'image/jpeg';await uploadSubmittalFile(`doc:${id}`,new File([file],file.name,{type}));onAttach(target,{id,name:file.name,type,size:file.size});done++;}setNotice(`${done} supporting document(s) attached. Review relevant replies and save the submittal.`);}
  catch(error){setNotice(`${done} file(s) attached. ${error instanceof Error?error.message:'Upload failed.'} Retry the remaining files.`);}finally{setBusy(false);onBusy(false);}
 }}/>
 <p className="text-xs">{available.reduce((n,s)=>n+s.docs.length,0)} supporting attachment(s). Manage files in the document sections below.</p>
 {notice&&<p role="status" className="text-sm">{notice}</p>}
 </div>;
}
