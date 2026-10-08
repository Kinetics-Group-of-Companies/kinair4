type Scope={companyId:string;brandId:string;seriesIds:string[];customProducts:string[]};
type Row={id?:string;comment?:string;reply?:string;reviewed?:boolean;included?:boolean;kind?:string;noReplyReason?:string};
type Saved={id:string;ref:string;rev:number;updated_at:string;data:{companyId?:string;brandId?:string;seriesIds?:string[];customProducts?:string[];compliance?:{id?:string;sourceChecked?:boolean;rows?:Row[]};rtcc?:{id?:string;rows?:Row[]}[]}};
export type LearnedExample={libraryId:string;specification:string;reply:string;score:number;source:'saved-compliance'|'saved-rtcc'};
const sorted=(v:string[]|undefined)=>JSON.stringify([...(v||[])].sort());
/** Latest saved revision wins, including removal/unreviewing of an old reply. */
export function savedReplyExamples(records:Saved[],scope:Scope,comments:{comment:string}[],action:'rtcc'|'compliance'):LearnedExample[]{
 const latest=new Map<string,Saved>();
 for(const record of records){const key=record.ref||record.id,old=latest.get(key);if(!old||record.rev>old.rev||(record.rev===old.rev&&record.updated_at>old.updated_at))latest.set(key,record);}
 const terms=[...new Set(comments.flatMap(c=>c.comment.toLowerCase().match(/[a-z0-9-]{4,}/g)||[]))].filter(t=>!['shall','should','with','that','this','must','from','have','submitted','provide','comply','noted'].includes(t));
 const examples:LearnedExample[]=[];
 for(const record of latest.values()){
  const data=record.data;if(!data||data.companyId!==scope.companyId||data.brandId!==scope.brandId||sorted(data.seriesIds)!==sorted(scope.seriesIds)||sorted(data.customProducts)!==sorted(scope.customProducts))continue;
  const groups=action==='compliance'?(data.compliance?.sourceChecked?[{id:data.compliance.id,rows:data.compliance.rows}]:[]):(data.rtcc||[]);
  for(const group of groups)for(const row of group.rows||[]){
   if(!row.reviewed||row.included===false||row.kind==='heading'||row.kind==='information'||!row.comment?.trim()||!row.reply?.trim())continue;
   const score=terms.reduce((n,t)=>n+Number(row.comment!.toLowerCase().includes(t)),0);if(!score)continue;
   examples.push({libraryId:`saved:${record.id}:${group.id||''}:${row.id||''}`,specification:row.comment.slice(0,6000),reply:row.reply.slice(0,3000),score,source:action==='compliance'?'saved-compliance':'saved-rtcc'});
  }
 }
 const seen=new Set<string>();return examples.sort((a,b)=>b.score-a.score).filter(e=>{const key=(e.specification+'\n'+e.reply).replace(/\s+/g,' ').toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
}
