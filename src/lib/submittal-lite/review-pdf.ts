import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ExportTable } from './review-excel';

/** Standalone review sheets use the same presentation data as editable Excel.
 * Final assembled submittals still resolve references to their actual page numbers.
 */
export type ReviewPdfBranding = { companyLogo?:string; brandLogo?:string; stamp?:string };

async function embedAsset(doc:PDFDocument,url?:string){
 if(!url)return;
 try{
  const response=await fetch(url);
  if(!response.ok)return;
  const bytes=await response.arrayBuffer();
  const type=(response.headers.get('content-type')||'').toLowerCase();
  if(type.includes('png')||/^data:image\/png/i.test(url))return await doc.embedPng(bytes);
  if(type.includes('jpeg')||type.includes('jpg')||/^data:image\/jpe?g/i.test(url))return await doc.embedJpg(bytes);
  try{return await doc.embedPng(bytes);}catch{return await doc.embedJpg(bytes);}
 }catch{return;}
}

export async function buildReviewPdf(tables: ExportTable[], branding:ReviewPdfBranding={}): Promise<Uint8Array> {
 const sheets=tables.filter(t=>t.statement);
 if(!sheets.length)throw new Error('Create a review sheet before previewing.');
 const doc=await PDFDocument.create();
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const [companyLogo,brandLogo,stamp]=await Promise.all([embedAsset(doc,branding.companyLogo),embedAsset(doc,branding.brandLogo),embedAsset(doc,branding.stamp)]);
 const ink=rgb(.12,.15,.2),white=rgb(1,1,1),border=rgb(.5,.56,.64);
 const clean=(s:string)=>s.replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"');
 const wrap=(value:string|number,width:number,strong=false):string[]=>{
  const font=strong?bold:regular,result:string[]=[];
  for(const paragraph of clean(String(value)).split('\n')){
   let line='';
   for(const word of paragraph.split(/\s+/)){
    const candidate=line ? line+' '+word : word;
    if(font.widthOfTextAtSize(candidate,8)<=width){line=candidate;continue;}
    if(line){result.push(line);line='';}
    for(const character of word){
     if(line&&font.widthOfTextAtSize(line+character,8)>width){result.push(line);line='';}
     line+=character;
    }
   }
   result.push(line);
  }
  return result;
 };
 for(const table of sheets){
  // Reject unsupported text visibly instead of silently deleting it from the PDF.
  for(const row of table.rows)for(const value of row){try{regular.encodeText(clean(String(value)).replace(/\n/g,' '));}catch{throw new Error('PDF export currently supports English and Western European text. Excel preserves other languages.');}}
  const blue=table.theme==='rtcc'?rgb(.04,.25,.49):rgb(.60,.74,.89),headerInk=table.theme==='rtcc'?white:ink;
  const widths=table.theme==='rtcc'?[32,390,372]:[48,402,344],xs=[24,24+widths[0],24+widths[0]+widths[1]];
  let page=doc.addPage([842,595]),y=0;
  const draw=(cells:string[][],at:number,take:number,header:boolean)=>{
   const height=Math.max(24,take*10+10);
   for(let i=0;i<3;i++){
    page.drawRectangle({x:xs[i],y:y-height,width:widths[i],height,color:header?blue:white,borderColor:border,borderWidth:.5});
    cells[i].slice(at,at+take).forEach((line,j)=>page.drawText(line,{x:xs[i]+6,y:y-14-j*10,font:header?bold:regular,size:8,color:header?headerInk:ink}));
   }
   y-=height;
  };
  const drawImageFit=(img:any,x:number,y:number,maxW:number,maxH:number,opacity=1)=>{
   if(!img)return;
   const scale=Math.min(maxW/img.width,maxH/img.height);
   page.drawImage(img,{x,y:y+(maxH-img.height*scale)/2,width:img.width*scale,height:img.height*scale,opacity});
  };
  const start=()=>{
   page.drawRectangle({x:24,y:551,width:794,height:24,color:blue});
   if(companyLogo){page.drawRectangle({x:28,y:553,width:82,height:20,color:white});drawImageFit(companyLogo,31,554,76,18);}
   if(brandLogo){page.drawRectangle({x:732,y:553,width:82,height:20,color:white});drawImageFit(brandLogo,735,554,76,18);}
   page.drawText(clean(String(table.rows[0][0])),{x:companyLogo?120:34,y:558,font:bold,size:12,color:headerInk});
   const details=wrap(table.rows[1]?.[0]||'',774);
   if(details.length>10)throw new Error('Project header is too long. Shorten project details before building.');
   y=537;details.forEach(line=>{page.drawText(line,{x:34,y,font:regular,size:8,color:ink});y-=11;});y-=6;
   const cells=table.rows[table.header].map((v,i)=>wrap(v,widths[i]-12,true));
   const height=Math.max(...cells.map(c=>c.length));
   if(height>12)throw new Error('Column title is too long. Shorten it before building.');
   draw(cells,0,height,true);
  };
  start();
  table.rows.slice(table.header+1).forEach((row,index)=>{
   const heading=!!table.headingRows?.includes(index+table.header+1);
   const cells=row.map((v,i)=>wrap(v,widths[i]-12,heading));
   const total=Math.max(1,...cells.map(c=>c.length));
   for(let at=0;at<total;){
    if(y<98){page=doc.addPage([842,595]);start();}
    const take=Math.min(total-at,Math.max(1,Math.floor((y-42)/10)-1));
    draw(cells,at,take,heading);at+=take;
   }
  });
 }
 doc.getPages().forEach((p,i)=>{
  p.drawText(`Page ${i+1} of ${doc.getPageCount()}`,{x:745,y:20,font:regular,size:8,color:ink});
  if(stamp){
   const scale=Math.min(96/stamp.width,50/stamp.height);
   p.drawImage(stamp,{x:635,y:28,width:stamp.width*scale,height:stamp.height*scale,opacity:.78});
  }
 });
 return doc.save();
}
