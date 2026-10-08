import type { RtccRow } from './rtcc';

export type ImportedReply={number:string;comment:string;reply:string};
export type ImportedSheet={name:string;kind:'rtcc'|'compliance';rows:ImportedReply[]};

const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
const head=(s:string)=>norm(s).toLowerCase().replace(/[.:/_-]+/g,' ').replace(/\s+/g,' ').trim();
const isNumberHeader=(s:string)=>/^(no|no |sr no|serial no|point no|comment no|clause|clause no)$/i.test(head(s))||/^(no|sr no|serial no|point no|comment no|clause)(\.| number)?$/i.test(norm(s));
const isRtccCommentHeader=(s:string)=>{const h=head(s);return h.includes('consultant comment')&&!h.includes('reply');};
const isComplianceCommentHeader=(s:string)=>{const h=head(s);return (h==='specification'||h.includes('specification requirement')||h.includes('original specification')||h.includes('specification original wording'))&&!h.includes('reply')&&!h.includes('compliance');};
const isRtccReplyHeader=(s:string)=>{const h=head(s);return h.includes('reply')&&h.includes('consultant');};
const isComplianceReplyHeader=(s:string)=>{const h=head(s);return h==='reply'||h.startsWith('proposed ')||h.includes('compliance reply')||h.includes('proposed compliance')||h.includes('proposed reply')||h.includes('compliance response');};

export function cleanImportedReply(s:string):string {
 return s.replace(/^\s*DRAFT - ENGINEER REVIEW\s*\n?/,'').replace(/^\s*\[Reply pending engineer review\]\s*$/,'').trim();
}

export async function readReplyWorkbook(bytes:ArrayBuffer):Promise<ImportedSheet[]> {
 if(bytes.byteLength>12*1024*1024)throw new Error('Use an Excel workbook smaller than 12 MB.');
 const XLSX=await import('xlsx');
 const book=XLSX.read(bytes,{type:'array',cellFormula:true});
 const result:ImportedSheet[]=[];
 for(const name of book.SheetNames){
  if(/review|evidence|comparison|excluded/i.test(name))continue;
  const sheet=book.Sheets[name],range=XLSX.utils.decode_range(sheet['!ref']||'A1');
  if(range.e.r>10000||range.e.c>100)throw new Error('Workbook is too large. Keep only the reply sheets.');
  let header=-1,kind:ImportedSheet['kind']='rtcc',numberCol=-1,commentCol=-1,replyCol=-1;
  for(let row=0;row<=Math.min(range.e.r,50)&&header<0;row++){
   const values=Array.from({length:Math.min(range.e.c+1,20)},(_,c)=>String(sheet[XLSX.utils.encode_cell({r:row,c})]?.v??'').trim());
   const n=values.findIndex(isNumberHeader);
   const rtccComment=values.findIndex(isRtccCommentHeader),rtccReply=values.findIndex(isRtccReplyHeader);
   const complianceComment=values.findIndex(isComplianceCommentHeader);let complianceReply=values.findIndex(isComplianceReplyHeader);
   if(n>=0&&rtccComment>=0&&rtccReply>=0){header=row;kind='rtcc';numberCol=n;commentCol=rtccComment;replyCol=rtccReply;break;}
   if(n>=0&&complianceComment>=0){if(complianceReply<0)complianceReply=values.findIndex((v,c)=>c!==n&&c!==complianceComment&&!!v.trim());if(complianceReply>=0){header=row;kind='compliance';numberCol=n;commentCol=complianceComment;replyCol=complianceReply;break;}}
  }
  if(header<0)continue;
  const rows:ImportedReply[]=[];
  for(let row=header+1;row<=range.e.r;row++){
   const cells=[numberCol,commentCol,replyCol].map(c=>sheet[XLSX.utils.encode_cell({r:row,c})]);
   if(cells.some(c=>c?.f||c?.t==='e'))throw new Error(`${name}, row ${row+1}: replace formulas or errors with plain text before importing.`);
   const [number,comment,reply]=cells.map(c=>String(c?.v??''));
   if(!number.trim()&&!comment.trim()&&!reply.trim())continue;
   if(!number.trim()){
    if(comment.trim()){rows.push({number:'',comment:comment.trim(),reply});continue;}
    if(!rows.length)throw new Error(`${name}, row ${row+1}: missing point number and source wording.`);
    rows[rows.length-1].reply+='\n'+reply;
    continue;
   }
   if(!comment.trim())throw new Error(`${name}, row ${row+1}: original wording is missing.`);
   rows.push({number:number.trim(),comment:comment.trim(),reply});
  }
  if(rows.length)result.push({name,kind,rows:rows.map(r=>({...r,reply:cleanImportedReply(r.reply)}))});
 }
 if(!result.length)throw new Error('No editable Compliance or RTCC reply sheet was found. Upload the KINAIR Excel export and keep the number, source wording and Reply column headings unchanged.');
 return result;
}

/** Match number AND original text; never trust row order or silently overwrite another point. */
export function matchImportedReplies(rows:ImportedReply[],current:(RtccRow&{number:string})[]):{id:string;reply:string}[]{
 const used=new Set<string>();
 return rows.map(row=>{
  const hits=current.filter(r=>norm(r.number)===norm(row.number)&&norm(r.comment)===norm(row.comment));
  if(hits.length!==1||used.has(hits[0].id))throw new Error(`Point ${row.number} does not uniquely match the current source. Use a fresh export and edit only the Reply column.`);
  if(row.reply.trim()&&hits[0].kind&&hits[0].kind!=='requirement')throw new Error(`Point ${row.number} is marked as not requiring a reply. Change its classification in the website before importing a reply.`);
  used.add(hits[0].id);
  return {id:hits[0].id,reply:row.reply};
 });
}
