import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PdfPreview } from './PdfPreview';

type Props={sourceKey:string;filename:string;build:()=>Promise<Uint8Array>;disabled?:boolean;disabledReason?:string};
export function ReviewPdfActions({sourceKey,filename,build,disabled=false,disabledReason}:Props){
 const [result,setResult]=useState<{key:string;bytes:Uint8Array}>();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
 const latest=useRef(sourceKey);latest.current=sourceKey;
 const current=result?.key===sourceKey?result:undefined;
 const generate=async(download:boolean)=>{
  const key=sourceKey;setBusy(true);setError('');
  try{
   const bytes=current?.bytes||await build();
   if(latest.current!==key){setError('The sheet changed while building. Preview again to use the latest edits.');return;}
   setResult({key,bytes});
   if(download){
    const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
   }else setOpen(true);
  }catch(e){setError(e instanceof Error?e.message:'Unable to build PDF. Please retry.');}
  finally{setBusy(false);}
 };
 return <div className="w-full min-w-0 space-y-3">
  <div className="flex flex-wrap gap-2">
   <Button type="button" variant="outline" disabled={busy||disabled} onClick={()=>void generate(false)}>{busy?'Building PDF…':'Preview PDF'}</Button>
   <Button type="button" variant="outline" disabled={busy||disabled} onClick={()=>void generate(true)}>Download PDF</Button>
   {open&&<Button type="button" variant="ghost" onClick={()=>setOpen(false)}>Close preview</Button>}
  </div>
  {disabled&&disabledReason&&<p className="text-sm text-amber-700">{disabledReason}</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {open&&!current&&<p role="status" className="text-sm text-muted-foreground">Sheet updated. Click Preview PDF to refresh.</p>}
  {open&&current&&<PdfPreview bytes={current.bytes} labels={[]} building={busy}/>}
 </div>;
}
