import { replyPointReady, suggestPointKind } from './reply-points';
import { stripRepeatedPageFurniture } from './page-furniture';
import type { RtccRow } from './rtcc';
import type { DocRef } from './records';
export type ComplianceRow = RtccRow & { clause:string;  sourcePage:number; included:boolean; exclusion?:string; reusedFrom?:string };
export type ComplianceSheet = { id:string; title:string; proposedTitle?:string; sourceText:string; source?:DocRef; sourceChecked:boolean; rows:ComplianceRow[]; provider?:string; contextKey?:string; generatedDocId?:string };
// Lossless segmentation: headings and unnumbered paragraphs remain in the review.
// Never summarize a specification or drop a repeated requirement.
const clausePrefix=/^\s*((?:\d+(?:\.\d+)+(?:[.)])?|\d{1,2}[.)]|[A-Za-z][.)]|[ivxIVX]+[.)]))\s+/;
const clauseLine=/^\s*(?:\d+(?:\.\d+)+(?:[.)])?|\d{1,2}[.)]|[A-Za-z][.)]|[ivxIVX]+[.)])\s+/

// Clause segmentation is source-faithful: only an explicit clause/list marker starts a new row.
// Unnumbered continuation paragraphs remain attached to their preceding numbered clause.
export function specificationRows(text:string,page=1):ComplianceRow[] {
 const groups:string[]=[];
 const normalized=text.replace(/\r/g,'').replace(/(^|\n)([ \t]*(?:\d+(?:\.\d+)+(?:[.)])?|\d{1,2}[.)]|[A-Za-z][.)]|[ivxIVX]+[.)]))[ \t]*\n(?=\S)/g,'$1$2 ');
 let paragraphBreak=false;
 for(const raw of normalized.split('\n')){
  const line=raw.trim();
  if(!line){paragraphBreak=true;continue;}
  const begins=clauseLine.test(line);
  if(!groups.length||begins)groups.push(line);
  else groups[groups.length-1]+=(paragraphBreak?'\n\n':' ')+line;
  paragraphBreak=false;
 }
 return groups.filter(s=>s.trim()).map(comment=>{
  const clause=comment.match(clausePrefix)?.[1]||'';
  const suggestion=suggestPointKind(comment);
  return {id:crypto.randomUUID(),clause,sourcePage:page,kind:suggestion.kind,noReplyReason:suggestion.kind==='information'?suggestion.reason:undefined,comment,reply:'',responsibility:'Joint',evidence:[],reviewed:false,included:true};
 });
}
export function complianceReady(s:ComplianceSheet){return s.sourceChecked&&s.rows.length>0&&s.rows.some(r=>r.included)&&s.rows.every(r=>r.included ? replyPointReady(r):!!r.exclusion?.trim());}
export function complianceSimilarity(a:string,b:string){const tokens=(s:string)=>new Set(s.toLowerCase().match(/[a-z0-9]+/g)||[]);const x=tokens(a),y=tokens(b);return [...x].filter(t=>y.has(t)).length/Math.max(1,new Set([...x,...y]).size);}
export function complianceCsv(sheet:ComplianceSheet){const cell=(s:string)=>'"'+(/^[=+@-]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"';return '\ufeff'+[['Clause','Source page','Specification','Compliance reply','Responsibility','Review','Supporting evidence'],...sheet.rows.filter(r=>r.included).map(r=>[r.clause,String(r.sourcePage),r.comment,r.reply,r.responsibility,r.reviewed?'Reviewed':'Draft',r.evidence.map(e=>e.docId+': '+e.quote).join('\n')])].map(row=>row.map(cell).join(',')).join('\r\n');}


/** One heading shared by the editing table and exports; never hard-code a product. */
export function complianceProposedTitle(sheet: ComplianceSheet, fields: {label:string;value:string}[]) {
 if(sheet.proposedTitle?.trim()) return sheet.proposedTitle.trim();
 const selected=fields.filter(f=>/^(brand(?: name)?|product|series|model)$/i.test(f.label.trim())&&f.value.trim()).map(f=>f.value.trim());
 return selected.length ? 'Proposed ' + [...new Set(selected)].join(' — ') : 'Proposed product / compliance reply';
}

export function isSpecificationHeading(text:string):boolean {
 return suggestPointKind(text).kind==='heading';
}
export function specificationBody(row:{clause?:string;comment:string}):string {
 const clause=(row.clause||'').trim();
 const flow=(row.comment||'').replace(/\r/g,'').trim().split(/\n{2,}/).map(paragraph=>paragraph.split(/\n+/).map(line=>line.trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean).join('\n\n');
 if(!clause)return flow;
 if(flow.startsWith(clause)){
  const rest=flow.slice(clause.length);
  if(!rest || /^\s/.test(rest))return rest.trim();
 }
 return flow;
}
export function specificationComment(clause:string,body:string):string {
 const c=clause.trim(),b=body.trim();
 return c ? (b ? c+' '+b : c) : b;
}
/** Remove letterhead / OCR metadata and isolate the actual specification section before clause segmentation. */
export function specificationSectionPages(pages:string[]):string[]{
 const cleaned=stripRepeatedPageFurniture(pages).map(page=>{
  const lines=page.replace(/\r/g,'').split('\n');
  const bottom=new Set(lines.map((x,i)=>x.trim()?i:-1).filter(i=>i>=0).slice(-7));
  const hasProjectFooter=[...bottom].some(i=>/^(?:Project|MEP)\s+Specifications?\b/i.test(lines[i].trim()));
  return lines.filter((line,i)=>{
   const s=line.trim();
   if(!s)return true;
   if(/^\[(?:OCR page|AI FULL-DOCUMENT READ|TEXT\/OCR CROSS-CHECK)/i.test(s))return false;
   if(/^(?:DOCUMENT\s+TYPE|SERIES\/MODEL\s+CODES?|MODEL\s+CODES?|DOCUMENT\s+CLASSIFICATION)\s*:/i.test(s))return false;
   if(bottom.has(i)&&/^(?:Project|MEP)\s+Specifications?\b/i.test(s))return false;
   if(bottom.has(i)&&hasProjectFooter&&/^Section\s+\d{4,}\b/i.test(s))return false;
   return true;
  }).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 });
 const looksLikeContentsPage=(page:string)=>{
  const lines=page.split('\n').map(x=>x.trim()).filter(Boolean);
  const top=lines.slice(0,14);
  const contents=top.some(x=>/^(?:TABLE\s+OF\s+)?CONTENTS?$/i.test(x));
  if(!contents)return false;
  const numbered=lines.filter(x=>/^\d+(?:\.\d+)+\s+[A-Z][A-Z0-9 ,/&()\-]+$/.test(x)).length;
  const parts=lines.filter(x=>/^PART\s+\d+\b/i.test(x)).length;
  return numbered>=4||parts>=2;
 };
 const sectionPages=cleaned.map(page=>looksLikeContentsPage(page)?'':page);
 const linePages=sectionPages.map(p=>p.split('\n'));
 let anchor:{page:number;line:number;kind:'section'|'part'|'clause'}|undefined;
 const tests:[RegExp,'section'|'part'|'clause'][]=[
  [/^\s*SECTION\s+\d{4,}\b/i,'section'],
  [/^\s*PART\s+\d+\b/i,'part'],
  [/^\s*\d+(?:\.\d+)+\s+\S/,'clause'],
 ];
 for(const [re,kind] of tests){
  for(let p=0;p<linePages.length&&!anchor;p++){
   const line=linePages[p].findIndex(x=>re.test(x.trim()));
   if(line>=0)anchor={page:p,line,kind};
  }
  if(anchor)break;
 }
 if(!anchor)return sectionPages;
 let ended=false;
 return linePages.map((lines,p)=>{
  if(p<anchor!.page||ended)return '';
  let from=0;
  if(p===anchor!.page)from=anchor!.line+(anchor!.kind==='clause'?0:1);
  const out:string[]=[];
  for(let i=from;i<lines.length;i++){
   const s=lines[i].trim();
   if(/^\s*END\s+OF\s+SECTION\b/i.test(s)){ended=true;break;}
   // SECTION is an anchor, not a compliance point. A later SECTION starts a new unrelated section.
   if(p!==anchor!.page&&/^\s*SECTION\s+\d{4,}\b/i.test(s)){ended=true;break;}
   // PART headings are structural only; clause headings (1.1, 1.2...) remain.
   if(/^\s*PART\s+\d+\b/i.test(s))continue;
   out.push(lines[i]);
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
 });
}

/** Build compliance rows from the isolated specification section only. */
export function specificationPageRows(pages:string[]):ComplianceRow[]{
 const cleaned=specificationSectionPages(pages);
 const rows:ComplianceRow[]=[];
 cleaned.forEach((page,index)=>{
  if(!page.trim())return;
  const current=specificationRows(page,index+1);
  if(rows.length&&current.length&&!current[0].clause&&current[0].kind!=='heading'&&rows[rows.length-1].kind!=='heading'){
   rows[rows.length-1].comment+=' '+current.shift()!.comment.trim();
  }
  rows.push(...current);
 });
 return rows;
}
