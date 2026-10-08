import { replyPointReady, suggestPointKind } from './reply-points';
import type { DocRef } from './records';
export type RtccEvidence = { docId: string; quote: string };
export type RtccRow = {
  supportingDocIds?: string[];
  id: string; kind?: 'requirement'|'heading'|'information'; noReplyReason?: string; sourceNumber?: string; comment: string; reply: string; responsibility: 'Supplier' | 'Contractor' | 'Joint';
  reviewed: boolean; evidence: RtccEvidence[]; reviewNote?: string;
  comparison?: { requirement: string; offered: string; justification: string };
};
export type RtccRound = { id: string; number: number; date: string; source?: DocRef; sourceText: string; rows: RtccRow[]; provider?: string };
/** Identify main numbered comments before considering nested bullets or form text. */
export function consultantCommentEntries(text: string): {number?:string;comment:string}[] {
 let body=text.replace(/\r/g,'').replace(/^\s*\[(?:OCR page[^\]]*|AI FULL-DOCUMENT READ|TEXT\/OCR CROSS-CHECK)\]\s*$/gm,'');
 const heading=/(?:The above documents were reviewed and commented as follows\s*:|consultant[’']?s?\s+comments\s*:|comments\s*(?:by\s+consultant)?\s*:)/i.exec(body);
 if(heading)body=body.slice(heading.index+heading[0].length);
 body=body.split(/(?:^|\n)\s*(?:Reviewed and commented by|Action Status\s*:|ENGINEERS?['’]?\/?RE REVIEW|Construction Manager Review|CLIENT['’]S REVIEW|Name,? Sign|consultant[’']?s?\s+signature|signed\s+by|contractor[’']?s?\s+signature)\b/i)[0];
 const matches=[...body.matchAll(/^[ \t]*(\d{1,3})[.)](?:[ \t]+|[ \t]*\n)/gm)];
 if(matches.length){
  // The main list is an increasing sequence. Nested lists stay inside their parent.
  const indent=Math.min(...matches.map(m=>m[0].match(/^[ \t]*/)?.[0].length||0));
  const main=matches.filter(m=>(m[0].match(/^[ \t]*/)?.[0].length||0)===indent);
  return main.map((m,i)=>({number:m[1],comment:body.slice(m.index!+m[0].length,main[i+1]?.index??body.length).replace(/\s+/g,' ').trim()})).filter(x=>x.comment.length>0);
 }
 if(/[*•●]/.test(body))return body.slice(body.search(/[*•●]/)).split(/[*•●]/).map(s=>({comment:s.replace(/\s+/g,' ').trim()})).filter(x=>x.comment.length>5);
 return body.split(/\n\s*\n/).map(s=>({comment:s.replace(/\s+/g,' ').trim()})).filter(x=>x.comment.length>5&&/[a-zA-Z]/.test(x.comment)&&! /^(?:Comments Sheet|PROJECT|CONTRACTOR|Document No|SUBJECT|Name|Signature|Code [A-D])(?:\s|$)/i.test(x.comment));
}
export function splitConsultantComments(text: string): string[] {return consultantCommentEntries(text).map(x=>x.comment);}
export function rtccCommentBody(row:{sourceNumber?:string;comment:string}):string {
 const number=(row.sourceNumber||'').trim();
 const comment=(row.comment||'').trimStart();
 if(!number)return comment.trim();
 if(comment===number)return '';
 if(comment.startsWith(number)){
  const rest=comment.slice(number.length);
  if(/^[.)\]:\-\s]/.test(rest))return rest.replace(/^[.)\]:\-\s]+/,'').trim();
 }
 return comment.trim();
}
export function localRtccReply(comment: string): Pick<RtccRow, 'reply' | 'responsibility' | 'reviewNote'> {
  // Only administrative/site coordination statements can be drafted without product evidence.
  if (/warranty|certif|\bIEC\b|\bAMCA\b|\bDCD\b|efficien|noise|\bNC\b|\bdB|capacity|performance|stainless|casing|fire|airflow|pressure|\bCFM\b/i.test(comment))
    return { reply: '', responsibility: 'Joint', reviewNote: 'Check the offered model and supporting documents before confirming this requirement.' };
  if (/^\s*(?:noted|no objection|accepted|approved)[.!]?\s*$/i.test(comment)) return { reply: 'Noted.', responsibility: 'Supplier' };
  if (/(?:by (?:the )?contractor|contractor[’']?s? scope|scope of (?:the )?contractor)/i.test(comment) && !/supplier|manufacturer|train|supervis|factory|supply|provide|warranty|certif/i.test(comment))
    return { reply: 'Noted. Under the contractor’s scope as stated in this comment.', responsibility: 'Contractor' };
  return { reply: '', responsibility: 'Joint', reviewNote: 'Engineer confirmation or supporting evidence required.' };
}
export function newRtccRows(text: string): RtccRow[] {
  return consultantCommentEntries(text).map(({comment,number}) => {const suggestion=suggestPointKind(comment);return { id: crypto.randomUUID(), sourceNumber:number, comment, ...localRtccReply(comment), kind:suggestion.kind, noReplyReason:suggestion.kind==='information'?suggestion.reason:undefined, ...(suggestion.kind!=='requirement'?{reply:''}:{}), reviewed: false, evidence: [] };});
}
export function rtccReady(rounds: RtccRound[]): boolean {
  return rounds.every(r => r.rows.length > 0 && r.rows.every(replyPointReady));
}
export function validateEvidence(evidence: RtccEvidence[], documents: {id: string; text: string}[]): RtccEvidence[] {
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return evidence.filter(e => e.quote.trim().length >= 8 && documents.some(d => d.id === e.docId && normalize(d.text).includes(normalize(e.quote))));
}
export function parsePageSelection(value: string, count: number): number[] {
  if (!value.trim() || /^all$/i.test(value.trim())) return Array.from({length: count}, (_, i) => i);
  const pages = new Set<number>();
  for (const token of value.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(token);
    if (!match) throw new Error('Enter page numbers such as 1 or 1-3,5.');
    const a = Number(match[1]), b = Number(match[2] || match[1]);
    if (a < 1 || b < a || b > count) throw new Error(`Choose pages between 1 and ${count}.`);
    for (let n = a; n <= b; n++) pages.add(n - 1);
  }
  return [...pages].sort((a,b) => a-b);
}


export function rtccNumberingIssue(rows:RtccRow[]):string|undefined{
 const nums=rows.map(r=>r.sourceNumber).filter((n):n is string=>!!n).map(Number);
 if(nums.length<2)return;
 for(let i=1;i<nums.length;i++)if(nums[i]!==nums[i-1]+1)return `Comment numbering jumps from ${nums[i-1]} to ${nums[i]}. Check the original; paste the missing comment or correct the extraction before drafting.`;
}

