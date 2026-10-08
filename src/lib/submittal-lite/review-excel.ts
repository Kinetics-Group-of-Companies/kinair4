import { requiresReply, noReplyText } from './reply-points';
import type { Field, Section } from './records';
import { complianceProposedTitle, specificationBody, type ComplianceSheet } from './compliance';
import { rtccCommentBody, type RtccRound, type RtccRow } from './rtcc';

export type ExportTable = { name: string; rows: (string | number)[][]; header: number; widths: number[]; statement?:boolean; headingRows?:number[]; editRows?:(string|number)[][]; theme?:'compliance'|'rtcc' };
const projectRows = (title: string, fields: Field[], source?: string): (string | number)[][] => [
  [title], ...fields.filter(f => f.value.trim()).map(f => [f.label, f.value]),
  ...(source ? [['Source document', source]] : []),
  ['References', 'Document names and section titles below refer to the current editor. Final combined-PDF page numbers are not assigned by this Excel export.'],
  [],
];
function evidenceText(row: RtccRow, sections: Section[]) {
  return row.evidence.map(e => {
    const matches = sections.filter(s => !s.auto && s.docs.some(d => d.id === e.docId));
    const names = matches.map(s => s.title + ' / ' + s.docs.find(d => d.id === e.docId)!.name);
    return (names.length ? names.join('; ') : 'Missing supporting document (' + e.docId + ')') + (e.quote ? '\n' + e.quote : '');
  }).join('\n\n');
}
function replyCells(row: RtccRow, sections: Section[]): (string | number)[] {
  return [row.comment, row.reply, row.responsibility, row.reviewed ? 'Reviewed' : 'Draft',
    evidenceText(row, sections), [row.reviewNote, 'Point type: '+(row.kind||'requirement'), row.noReplyReason].filter(Boolean).join('\n'), row.comparison?.requirement || '',
    row.comparison?.offered || '', row.comparison?.justification || ''];
}
const replyHeaders = ['Consultant comment', 'Reply to consultant', 'Responsibility', 'Review status', 'Supporting documents / evidence', 'Engineer review note', 'Comparison requirement', 'Offered product', 'Comparison justification'];
const replyWidths = [65, 65, 18, 18, 55, 40, 40, 40, 55];
const projectHeader = (fields: Field[], fallback: string) => fields.filter(f=>f.value.trim()).map(f=>`${f.label}: ${f.value}`).join('   |   ') || fallback;
const editableStatementHeader = (title:string, fields:Field[]):(string|number)[][] => [
 [title],
 ...fields.filter(f=>f.value.trim()).map(f=>[`${f.label}: ${f.value}`]),
];
const referenceName = (id: string, sections: Section[]) => sections.filter(s=>!s.auto).flatMap(s=>s.docs).find(d=>d.id===id)?.name || 'Supporting document unavailable';
function displayReply(row: RtccRow, sections: Section[], heading = false) {
 if(!requiresReply(row))return noReplyText(row);
 const refs=[...new Set([...row.evidence.map(e=>e.docId),...(row.supportingDocIds||[])] .map(id=>referenceName(id,sections)))];
 return `${heading?'':row.reply.trim()||'[Reply pending]'}${refs.length?'\nPlease refer to '+refs.join('; ')+'.':''}`;
}
function comparisonTable(name: string, title: string, rows: RtccRow[], fields: Field[], sections: Section[], widths: number[], theme: 'compliance'|'rtcc'): ExportTable[] {
 const compared=rows.filter(r=>requiresReply(r)&&r.comparison&&(r.comparison.offered.trim()||r.comparison.justification.trim()));
 return compared.length ? [{name,statement:true,theme,widths,header:2,rows:[
  [title+' | Technical comparison'],[projectHeader(fields,title)],
  ['No.','Requirement / offered alternative','Justification and evidence'],
  ...compared.map(r=>[((r as RtccRow & {clause?:string}).clause||r.sourceNumber||''),`Required: ${specificationBody({clause:(r as RtccRow & {clause?:string}).clause,comment:r.comparison!.requirement})}\nOffered: ${r.comparison!.offered}`,`${r.comparison!.justification}\n${r.evidence.map(e=>referenceName(e.docId,sections)+'\nEvidence: '+e.quote).join('\n')}`])
 ]}] : [];
}
export function complianceExportTables(sheet: ComplianceSheet, fields: Field[], sections: Section[]): ExportTable[] {
  const rows = projectRows(sheet.title || 'COMPLIANCE STATEMENT', fields, sheet.source?.name);
  rows.push(['Source checked', sheet.sourceChecked ? 'Yes' : 'No']);
  const header = rows.length;
  rows.push(['Clause', 'Specification source page', 'Specification requirement', 'Compliance reply', ...replyHeaders.slice(2)]);
  for (const row of sheet.rows.filter(r => r.included)) rows.push([row.clause, row.sourcePage, ...replyCells(row, sections)]);
  const display: (string|number)[][] = editableStatementHeader('COMPLIANCE STATEMENT | Specification compliance',fields);
  const displayHeader = display.length;
  display.push(['Clause', 'Specification', complianceProposedTitle(sheet, fields)]);
  sheet.rows.filter(r=>r.included).forEach((r)=>display.push([r.clause,specificationBody(r),displayReply(r,sections,r.kind==='heading')]));
  return [
    {name:'Compliance Statement',editRows:sheet.rows.filter(r=>r.included).map(r=>[r.clause,specificationBody(r),requiresReply(r)?r.reply:'']),rows:display,header:displayHeader,widths:[10,62,62],statement:true,theme:'compliance',headingRows:sheet.rows.filter(r=>r.included).flatMap((r,i)=>r.kind==='heading'?[displayHeader+1+i]:[])},
    ...comparisonTable('Compliance Comparison','COMPLIANCE STATEMENT',sheet.rows.filter(r=>r.included),fields,sections,[10,62,62],'compliance')
  ];
}
export function rtccExportTables(rounds: RtccRound[], fields: Field[], sections: Section[]): ExportTable[] {
 return [...rounds].sort((a,b)=>b.number-a.number).flatMap((round,index): ExportTable[]=>{
  const label='RTCC '+String(round.number).padStart(2,'0');
  const name=rounds.filter(r=>r.number===round.number).length>1?label+' ('+(index+1)+')':label;
  const rows:(string|number)[][]=editableStatementHeader(label+' | Reply to Consultant Comments',fields);
  const header=rows.length;rows.push(['No.','Consultant comments','Reply to Consultant comments']);
  round.rows.forEach((row,i)=>rows.push([row.sourceNumber||i+1,rtccCommentBody(row),displayReply(row,sections)]));
  const audit=projectRows('Review & evidence — '+label,fields,round.source?.name);audit.push(['Round date',round.date]);
  const auditHeader=audit.length;audit.push(['Sr. No.',...replyHeaders]);
  round.rows.forEach((row,i)=>audit.push([row.sourceNumber||i+1,...replyCells(row,sections)]));
  return [{name,editRows:round.rows.map((r,i)=>[r.sourceNumber||i+1,rtccCommentBody(r),requiresReply(r)?r.reply:'']),rows,header,widths:[10,62,62],statement:true,theme:'rtcc',headingRows:round.rows.flatMap((r,i)=>r.kind==='heading'?[header+1+i]:[])},...comparisonTable(name+' Comparison',label,round.rows,fields,sections,[10,62,62],'rtcc')];
 });
}
export function wrapExcelText(value: string | number, width: number): string[] {
 const limit=Math.max(4,Math.floor(width*.78));
 return String(value).split('\n').flatMap(line=>{
  if(!line)return [''];
  const result:string[]=[];
  while(line.length>limit){let cut=line.lastIndexOf(' ',limit-1);if(cut<1)cut=limit;else cut++;result.push(line.slice(0,cut));line=line.slice(cut);}
  if(line)result.push(line);
  return result;
 });
}
export function printableExcelTables(tables: ExportTable[]): ExportTable[] {
 return tables.map(table=>{
  if(!table.statement)return table;
  const rows=table.rows.slice(0,table.header+1),headingRows:number[]=[];
  table.rows.slice(table.header+1).forEach((row,index)=>{
   const cells=row.map((v,c)=>wrapExcelText(v,table.widths[c]));
   const count=Math.max(1,...cells.map(c=>c.length));
   if(count<=28){if(table.headingRows?.includes(table.header+1+index))headingRows.push(rows.length);rows.push(row);return;}
   for(let line=0;line<count;line+=28){
    if(table.headingRows?.includes(table.header+1+index))headingRows.push(rows.length);
    rows.push(cells.map(c=>c.slice(line,line+28).join('\n')));
   }
  });
  return {...table,rows,headingRows};
 });
}
export async function buildReviewExcel(tables:ExportTable[]):Promise<Uint8Array>{
 if(!tables.length)throw new Error('Create a compliance sheet or RTCC round before exporting.');
 if(tables.some(t=>t.rows.some(r=>r.some(v=>typeof v==='string'&&v.length>32767))))throw new Error('A comment or reply exceeds Excel’s cell limit. Split that point into smaller rows before exporting.');
 tables=printableExcelTables(tables.map(t=>t.editRows?{...t,rows:[...t.rows.slice(0,t.header+1),...t.editRows]}:t));
 const ExcelJSImport:any=await import('exceljs');
 const ExcelJS:any=ExcelJSImport.default||ExcelJSImport;
 const workbook=new ExcelJS.Workbook();
 workbook.creator='KINAIR';
 workbook.company='Kinetics Middle East LLC';
 workbook.created=new Date();
 const border={top:{style:'thin',color:{argb:'FF7A8796'}},left:{style:'thin',color:{argb:'FF7A8796'}},bottom:{style:'thin',color:{argb:'FF7A8796'}},right:{style:'thin',color:{argb:'FF7A8796'}}};
 const dark='FF0A407D', light='FFD9EAF7', edit='FFFFF2CC';
 for(const table of tables){
  const ws=workbook.addWorksheet(table.name.slice(0,31),{
   properties:{defaultRowHeight:18},
   views:[{state:'frozen',ySplit:table.header+1,showGridLines:false}]
  });
  table.rows.forEach(row=>ws.addRow(row));
  table.widths.forEach((width,i)=>{ws.getColumn(i+1).width=Math.max(10,Math.min(65,width));});
  if(table.statement&&table.header>0){
   for(let ri=1;ri<=table.header;ri++)ws.mergeCells(ri,1,ri,3);
  }
  const headerRow=table.header+1;
  ws.eachRow({includeEmpty:true},(row:any,rowNumber:number)=>{
   const zero=rowNumber-1;
   const heading=table.headingRows?.includes(zero);
   const values=table.rows[zero]||[];
   const lineCount=table.statement&&zero<table.header
    ?Math.max(1,wrapExcelText(values[0]??'',table.widths.reduce((a,b)=>a+b,0)).length)
    :Math.max(1,...values.map((v,i)=>wrapExcelText(v??'',table.widths[i]||25).length));
   row.height=Math.min(405,Math.max(rowNumber===1?30:24,lineCount*15+8));
   row.eachCell({includeEmpty:true},(cell:any,colNumber:number)=>{
    cell.font={name:'Arial',size:10,color:{argb:'FF111827'}};
    cell.alignment={vertical:'top',horizontal:colNumber===1&&zero>=table.header?'center':'left',wrapText:true,indent:0};
    cell.border=border;
    if(rowNumber===1){
     cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:dark}};
     cell.font={name:'Arial',size:14,bold:true,color:{argb:'FFFFFFFF'}};
     cell.alignment={vertical:'middle',horizontal:'left',wrapText:true,indent:0};
    } else if(rowNumber===headerRow||heading){
     cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:light}};
     cell.font={name:'Arial',size:10,bold:true,color:{argb:'FF111827'}};
     cell.alignment={vertical:'top',horizontal:colNumber===1?'center':'left',wrapText:true,indent:0};
    } else if(table.editRows&&rowNumber>headerRow&&colNumber===3){
     cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:edit}};
    }
   });
  });
  ws.pageSetup={
   paperSize:9,
   orientation:'landscape',
   fitToPage:true,
   fitToWidth:1,
   fitToHeight:0,
   margins:{left:0.25,right:0.25,top:0.35,bottom:0.35,header:0.15,footer:0.15},
   printTitlesRow:`1:${headerRow}`
  };
  ws.headerFooter={oddFooter:'&RPage &P of &N'};
 }
 const buffer=await workbook.xlsx.writeBuffer();
 return new Uint8Array(buffer as ArrayBuffer);
}
export async function downloadReviewExcel(tables: ExportTable[], filename: string) {
 const bytes=await buildReviewExcel(tables);
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

