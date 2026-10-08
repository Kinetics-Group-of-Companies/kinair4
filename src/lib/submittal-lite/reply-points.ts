import type { RtccRow } from './rtcc';

export function requiresReply(row: Pick<RtccRow,'kind'>): boolean {
 return row.kind !== 'heading' && row.kind !== 'information';
}
export function replyPointReady(row: RtccRow): boolean {
 if(!row.reviewed || !row.comment.trim())return false;
 if(!requiresReply(row))return row.kind==='heading'||!!row.noReplyReason?.trim();
 return !!row.reply.trim() && (!row.comparison || !!row.comparison.requirement.trim() && !!row.comparison.offered.trim() && !!row.comparison.justification.trim());
}
/** Conservative local recognition. Ambiguous technical clauses always require a reply. */
export function suggestPointKind(text: string): {kind: 'requirement'|'heading'|'information'; reason: string} {
 const value=text.replace(/^\s*(?:\d+(?:\.\d+)*[.)]?|[A-Z][.)])\s+/,'').trim();
 if(/\b(?:shall|must|provide|submit|confirm|comply|ensure|required|refer|to be|install|supply|revise|clarify)\b/i.test(value))return {kind:'requirement',reason:'Contains a requirement or requested action.'};
 if(/^(?:for information only|for reference only|no (?:reply|response) (?:is )?required)[.!]?$/i.test(value))return {kind:'information',reason:'Source explicitly states that no response is required.'};
 const words=value.replace(/[:\-–]+$/,'').split(/\s+/).filter(Boolean);
 const titleCase=words.length>0&&words.length<=10&&words.every(w=>/^(?:and|or|of|for|to|the|in|on|with)$/i.test(w)||/^[A-Z][A-Za-z0-9/&()-]*$/.test(w));
 const allCaps=value.length<140&&/[A-Z]/.test(value)&&value===value.toUpperCase()&&!/[.!?]$/.test(value);
 if(value.length<140 && (
   /^(?:SECTION\s+[\d .-]+|PART\s+\d+\s*[-–:]?\s*)[A-Z &/()-]*$/.test(value) ||
   /^(?:GENERAL|GENERAL REQUIREMENTS|PRODUCTS|EXECUTION|SCOPE|REFERENCES|RELATED DOCUMENTS|SUMMARY|PERFORMANCE REQUIREMENTS|SUBMITTALS|QUALITY ASSURANCE|TECHNICAL SPECIFICATIONS|CONSULTANT COMMENTS|REVIEW COMMENTS|INSTALLATION|TESTING AND COMMISSIONING)$/i.test(value) ||
   allCaps || /:$/.test(value) || titleCase
 ))return {kind:'heading',reason:'Recognised specification/comment heading; no direct reply required.'};
 return {kind:'requirement',reason:'Reply required unless the engineer confirms otherwise.'};
}
export function noReplyText(row: RtccRow): string {
 return row.kind==='heading'?'':'No reply required: '+(row.noReplyReason?.trim()||'[Reason pending]');
}
