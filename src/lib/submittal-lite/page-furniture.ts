/**
 * Removes running page furniture before specification / consultant-comment parsing.
 * The filter is conservative: real numbered clauses/comments are protected.
 */
const compact=(s:string)=>s.replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();

const obviousMetadata=(s:string)=>
 /^(?:document\s+type|document\s+title|file\s+type|page\s+type)\s*:/i.test(compact(s));

const normalPageNumber=(s:string)=>
 /^(?:page\s*)?\d{1,4}\s*(?:of|\/|-)\s*\d{1,4}$/i.test(compact(s)) ||
 /^page\s*\d{1,4}$/i.test(compact(s));

const protectedContent=(s:string)=>
 /^\s*(?:\d+(?:\.\d+)+(?:[.)])?|\d+[.)]|[A-Za-z][.)]|[ivxIVX]+[.)])\s+\S/.test(s);

const normalizeFurniture=(s:string)=>
 compact(s)
  .toLowerCase()
  .replace(/[–—]/g,'-')
  .replace(/\bpage\s*\d{1,4}\s*(?:of|\/|-)\s*\d{1,4}\b/gi,'page #')
  .replace(/\bpage\s*\d{1,4}\b/gi,'page #')
  .replace(/\s*[|•·]+\s*/g,' ')
  .replace(/[^a-z0-9#]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();

function editDistance(a:string,b:string){
 const prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let old=prev[0];prev[0]=i;
  for(let j=1;j<=b.length;j++){
   const tmp=prev[j];
   prev[j]=Math.min(prev[j]+1,prev[j-1]+1,old+(a[i-1]===b[j-1]?0:1));
   old=tmp;
  }
 }
 return prev[b.length];
}
function similarFurniture(a:string,b:string){
 if(a===b)return true;
 if(a.length<5||b.length<5)return false;
 if(a.includes(b)||b.includes(a))return Math.min(a.length,b.length)>=Math.max(8,Math.floor(Math.max(a.length,b.length)*.72));
 const max=Math.max(a.length,b.length);
 if(Math.abs(a.length-b.length)<=4 && editDistance(a,b)/max<=0.22)return true;
 const ta=new Set(a.split(' ').filter(x=>x.length>2)),tb=new Set(b.split(' ').filter(x=>x.length>2));
 const common=[...ta].filter(x=>tb.has(x)).length,union=new Set([...ta,...tb]).size;
 return union>=3&&common/union>=.68;
}

type Margin={i:number;region:'top'|'bottom';edge:boolean};
function margins(lines:string[],depth=8):Margin[]{
 const nonEmpty=lines.map((v,i)=>({v:compact(v),i})).filter(x=>x.v);
 const top=nonEmpty.slice(0,depth).map((x,pos)=>({i:x.i,region:'top' as const,edge:pos<3}));
 const bottom=nonEmpty.slice(-depth).map((x,pos,arr)=>({i:x.i,region:'bottom' as const,edge:pos>=arr.length-3}));
 const byIndex=new Map<number,Margin>();
 for(const item of [...top,...bottom])byIndex.set(item.i,item);
 return [...byIndex.values()];
}

export function stripRepeatedPageFurniture(pages:string[]):string[]{
 if(!pages.length)return pages;
 const split=pages.map(p=>p.replace(/\r/g,'').split('\n'));
 const pageMargins=split.map(lines=>margins(lines));
 const entries=split.flatMap((lines,pageIndex)=>pageMargins[pageIndex].map(m=>({
  pageIndex,...m,text:compact(lines[m.i]||''),key:normalizeFurniture(lines[m.i]||'')
 })).filter(x=>x.text&&!protectedContent(x.text)&&!obviousMetadata(x.text)));
 const repeatMinimum=pages.length<=2?2:Math.min(3,Math.max(2,Math.ceil(pages.length*0.34)));

 return split.map((lines,pageIndex)=>{
  const lookup=new Map(pageMargins[pageIndex].map(m=>[m.i,m]));
  return lines.filter((line,i)=>{
   const s=compact(line);
   if(!s)return true;
   // AI/OCR metadata is never a specification clause or consultant comment.
   if(obviousMetadata(s))return false;
   const margin=lookup.get(i);
   if(!margin)return true;
   if(normalPageNumber(s))return false;
   // Bare digits at the extreme top/bottom are page numbers, not clauses.
   if(margin.edge&&/^\d{1,4}$/.test(s))return false;
   if(protectedContent(s))return true;
   const key=normalizeFurniture(s);
   if(!key)return false;
   const seenPages=new Set(entries.filter(e=>e.region===margin.region&&similarFurniture(key,e.key)).map(e=>e.pageIndex));
   return seenPages.size<repeatMinimum;
  }).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 });
}
