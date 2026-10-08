import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { readReplyWorkbook, type ImportedSheet } from '@/lib/submittal-lite/review-import';

export function ReplyExcelImport({kind,sourceKey,onApply}:{kind:'rtcc'|'compliance';sourceKey:string;onApply:(sheet:ImportedSheet)=>void}){
 const input=useRef<HTMLInputElement>(null);
 const [sheets,setSheets]=useState<ImportedSheet[]>([]),[selected,setSelected]=useState(0),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const sheet=sheets[selected];
 const label=kind==='compliance'?'Compliance Statement':'RTCC';
 const read=async(file?:File)=>{
  if(!file)return;
  setBusy(true);setNotice('');setSheets([]);const initial=sourceKey;
  try{
   const all=await readReplyWorkbook(await file.arrayBuffer());
   const matching=all.filter(s=>s.kind===kind);
   if(!matching.length)throw new Error(`No ${label} reply sheet was found in this workbook.`);
   setSheets(matching);setSelected(0);setKey(initial);
   setNotice(`${matching.length} ${label} sheet${matching.length===1?'':'s'} read. Check the preview below, then apply the replies.`);
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to read Excel.');}
  finally{setBusy(false);if(input.current)input.current.value='';}
 };
 return <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><p className="font-semibold">Upload completed Excel &amp; read replies</p><p className="text-sm text-muted-foreground">Download the KINAIR Excel, edit only the Reply column, save it, then upload the same file here. KINAIR will read the Compliance/RTCC replies back into the builder.</p></div>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Reading Excel…':'Upload Excel & read replies'}</Button>
  </div>
  <input ref={input} aria-label={`Upload completed ${kind} Excel`} type="file" accept=".xlsx,.xlsm,.xls" disabled={busy} className="sr-only" onChange={e=>void read(e.target.files?.[0])}/>
  {sheet&&<div className="mt-4 space-y-3 rounded-lg border bg-background p-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><label className="text-sm font-medium">Sheet to import <select className="ml-2 min-h-11 max-w-full rounded border bg-background p-2" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{sheets.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></label><span className="text-sm">{sheet.rows.length} points · {sheet.rows.filter(r=>r.reply.trim()).length} replies filled</span></div>
   <div className="max-h-64 overflow-auto rounded border">{sheet.rows.map((r,i)=><div key={i} className="border-b p-2 text-sm last:border-b-0"><strong>{r.number}</strong> {r.comment.slice(0,180)}<p className="mt-1 whitespace-pre-wrap"><span className="font-medium">Reply:</span> {r.reply||'(blank — matching website reply will be cleared)'}</p></div>)}</div>
   {key!==sourceKey&&<p className="text-sm text-destructive">The target changed after this Excel was read. Upload the workbook again before applying.</p>}
   <Button type="button" disabled={key!==sourceKey} onClick={()=>{try{onApply(sheet);setSheets([]);setNotice('Excel replies applied as drafts. Review them in the website and save the document.');}catch(e){setNotice(e instanceof Error?e.message:'Import failed.');}}}>Apply Excel replies to {label}</Button>
  </div>}
  {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
 </div>;
}
