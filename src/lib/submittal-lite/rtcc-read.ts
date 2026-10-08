import { extractClausePage, extractSetupText, readConsultantPage, readPlainTextPage, readScannedPage } from './extract';
import { newRtccRows, parsePageSelection, rtccNumberingIssue, type RtccRow } from './rtcc';
import { stripRepeatedPageFurniture } from './page-furniture';

export async function readConsultantComments(
  file: File,
  progress: (message:string)=>void = ()=>{},
  pages = 'all'
): Promise<{text:string;rows:RtccRow[];normalizedFile:File}> {
  let sourceText='';
  let rows:RtccRow[]|undefined;
  let upload=file;

  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
    const {PDFDocument}=await import('pdf-lib');
    const original=await PDFDocument.load(await file.arrayBuffer());
    const selected=parsePageSelection(pages,original.getPageCount());
    const selectedPdf=await PDFDocument.create();
    for(const page of await selectedPdf.copyPages(original,selected))selectedPdf.addPage(page);

    const texts:string[]=[];
    for(let i=0;i<selected.length;i++){
      progress(`Reading consultant comment page ${i+1} of ${selected.length}…`);
      const single=await PDFDocument.create();
      const [page]=await single.copyPages(original,[selected[i]]);
      single.addPage(page);
      const pageFile=new File([new Uint8Array(await single.save())],`Comment-page-${selected[i]+1}.pdf`,{type:'application/pdf'});
      let value=await extractClausePage(pageFile,readPlainTextPage);
      const firstRows=newRtccRows(value);
      if(!firstRows.length||rtccNumberingIssue(firstRows)){
        progress(`Reading visual consultant comments on page ${selected[i]+1}…`);
        value=await readConsultantPage(pageFile,readPlainTextPage);
      }
      if(!value.trim())throw new Error(`Page ${selected[i]+1} could not be read. Upload a clearer copy or use the RTCC builder to select only the comment pages.`);
      texts.push(value);
    }
    const cleanedPages=stripRepeatedPageFurniture(texts);
    sourceText=cleanedPages.join('\n\n');
    rows=cleanedPages.flatMap(pageText=>newRtccRows(pageText));
    upload=new File([new Uint8Array(await selectedPdf.save())],`Consultant-comments-${Date.now()}.pdf`,{type:'application/pdf'});
  } else {
    if(!/image\/(png|jpeg)/.test(file.type)&&!/\.(png|jpe?g)$/i.test(file.name))throw new Error('Upload consultant comments as PDF, PNG or JPG.');
    sourceText=await extractSetupText(upload,readScannedPage);
    const {PDFDocument}=await import('pdf-lib');
    const pdf=await PDFDocument.create();
    const bytes=await upload.arrayBuffer();
    const img=/png/i.test(upload.type)||/\.png$/i.test(upload.name)?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
    const scale=Math.min(794/img.width,1123/img.height);
    const page=pdf.addPage([img.width*scale,img.height*scale]);
    page.drawImage(img,{x:0,y:0,width:img.width*scale,height:img.height*scale});
    upload=new File([new Uint8Array(await pdf.save())],'Consultant-comments.pdf',{type:'application/pdf'});
  }

  const finalRows=rows??newRtccRows(sourceText);
  if(!sourceText.trim()||!finalRows.length)throw new Error('No consultant comments could be read from this file.');
  const issue=rtccNumberingIssue(finalRows);
  if(issue)throw new Error(issue);
  return {text:sourceText,rows:finalRows,normalizedFile:upload};
}
