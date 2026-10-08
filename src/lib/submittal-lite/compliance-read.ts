import { specificationRows, specificationPageRows, specificationSectionPages, type ComplianceRow } from './compliance';
import { extractSetupText, extractClausePage, readPlainTextPage } from './extract';
export async function readSpecification(file:File,progress:(s:string)=>void):Promise<{text:string;rows:ComplianceRow[]}>{
 if(file.size>80*1024*1024)throw new Error('Split specifications larger than 80 MB into separate documents.');
 const texts:string[]=[],rows:ComplianceRow[]=[];
 if(/\.pdf$/i.test(file.name)||file.type==='application/pdf'){
  const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.load(await file.arrayBuffer());
  for(let i=0;i<pdf.getPageCount();i++){
   progress(`Reading specification page ${i+1} of ${pdf.getPageCount()}…`);
   const one=await PDFDocument.create();const [p]=await one.copyPages(pdf,[i]);one.addPage(p);
   const f=new File([new Uint8Array(await one.save())],`Specification-page-${i+1}.pdf`,{type:'application/pdf'});
   // One page at a time prevents the generic document reader's page sampling.
   const text=await extractClausePage(f,readPlainTextPage);
   if(!text.trim())throw new Error(`Page ${i+1} is unreadable or blank. Remove blank pages or paste a verified transcription; no incomplete sheet was created.`);
   texts.push(text);
  }
  const sectionPages=specificationSectionPages(texts);
  rows.push(...specificationPageRows(sectionPages));
  texts.splice(0,texts.length,...sectionPages);
 }else if(/\.docx$/i.test(file.name)){
  const {CFB}=await import('xlsx');const archive=CFB.read(new Uint8Array(await file.arrayBuffer()),{type:'array'});
  const entry=archive.FileIndex[archive.FullPaths.findIndex(p=>/(?:^|\/)word\/document\.xml$/.test(p))];
  const xml=entry?.content?new TextDecoder().decode(new Uint8Array(entry.content as Uint8Array)):'';
  if(/<(?:w:)?numPr\b/.test(xml)||archive.FullPaths.some(p=>/word\/media\//.test(p)))throw new Error('This Word file has automatic numbering or embedded images. Export it as PDF so clause numbers and drawings are preserved.');
  const {readWordInquiry}=await import('./word-inquiry');const text=await readWordInquiry(file);texts.push(text);rows.push(...specificationRows(text));
 }else if(/\.(xlsx|xlsm|xls)$/i.test(file.name)){
  const XLSX=await import('xlsx');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
  for(const [index,name] of workbook.SheetNames.entries()){
   const sheet=workbook.Sheets[name];const text=XLSX.utils.sheet_to_csv(sheet,{FS:' | ',blankrows:false});
   if(!text.trim())continue;texts.push('Worksheet: '+name+'\n'+text);rows.push(...specificationRows(text,index+1));
  }
  if(!rows.length)throw new Error('No readable spreadsheet cells. Export images or charts as PDF.');
 }else{
  if(!/\.(txt|csv|png|jpg|jpeg)$/i.test(file.name))throw new Error('Upload PDF, PNG, JPG, TXT or CSV. Save Word/Excel as PDF to preserve the specification layout.');
  const text=/\.(txt|csv)$/i.test(file.name)?await file.text():await extractSetupText(file,readPlainTextPage);
  if(!text.trim())throw new Error('No specification text could be read. Paste a verified transcription.');
  texts.push(text);rows.push(...specificationRows(text));
 }
 return {text:texts.join('\n\n'),rows};
}

