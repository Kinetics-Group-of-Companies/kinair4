import {PDFDocument,StandardFonts} from 'pdf-lib';
import type {RtccRound} from './rtcc';
import type {FileData,PageLabel} from './pdf-build';
export function orderedRtccAttachments(rounds:RtccRound[]){return [...rounds].sort((a,b)=>b.number-a.number).flatMap(round=>round.rows.flatMap((row,i)=>(row.supportingDocIds||[]).map(docId=>({docId,round:round.number,comment:row.sourceNumber||String(i+1)}))));}
export async function buildRtccAttachments(rounds:RtccRound[],load:(id:string)=>Promise<FileData|undefined>){
 const refs=orderedRtccAttachments(rounds);if(!refs.length)return {bytes:undefined,labels:[] as PageLabel[]};
 const out=await PDFDocument.create(),font=await out.embedFont(StandardFonts.Helvetica);const labels:PageLabel[]=[];
 for(const ref of refs){const file=await load(ref.docId);if(!file)throw new Error(`Supporting document missing for RTCC ${ref.round}, comment ${ref.comment}.`);const label=`RTCC ${String(ref.round).padStart(2,'0')} - Comment ${ref.comment} - ${file.name}`;
  const first=out.getPageCount();
  if(file.type==='application/pdf'){const pdf=await PDFDocument.load(file.bytes.slice(0));for(const page of await out.copyPages(pdf,pdf.getPageIndices()))out.addPage(page);}
  else if(file.type==='image/png'||file.type==='image/jpeg'){const img=file.type==='image/png'?await out.embedPng(file.bytes):await out.embedJpg(file.bytes);const scale=Math.min(794/img.width,1123/img.height);const page=out.addPage([img.width*scale,img.height*scale]);page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});}
  else throw new Error(`Convert supporting document ${file.name} to PDF, PNG or JPG.`);
  for(const page of out.getPages().slice(first)){const box=page.getMediaBox();page.setMediaBox(box.x,box.y-22,box.width,box.height+22);page.setCropBox(box.x,box.y-22,box.width,box.height+22);page.drawText(label.replace(/[^\x20-\x7e]/g,' ').slice(0,110),{x:box.x+20,y:box.y-14,font,size:7});labels.push({label,kind:'doc',docId:ref.docId});}
 }
 return {bytes:await out.save(),labels};
}
export async function appendRtccAttachments(base:Uint8Array,rounds:RtccRound[],load:(id:string)=>Promise<FileData|undefined>){const attachments=await buildRtccAttachments(rounds,load);if(!attachments.bytes)return base;const out=await PDFDocument.load(base),extra=await PDFDocument.load(attachments.bytes);for(const page of await out.copyPages(extra,extra.getPageIndices()))out.addPage(page);return out.save();}
