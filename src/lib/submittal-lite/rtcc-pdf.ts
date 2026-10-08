import { buildRtccAttachments, orderedRtccAttachments } from './rtcc-attachments';
import { requiresReply, noReplyText } from './reply-points';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { BuildInput, FileData, PageLabel } from './pdf-build';
import type { RtccRound } from './rtcc';
export type RtccBuildRound = RtccRound & { sourceFile?: FileData };
type Result = { bytes: Uint8Array; labels: PageLabel[]; skipped: string[] };
const clean = (s: string) => s.replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e\n]/g, ' ');
function lines(text: string, font: PDFFont, width: number, size = 8): string[] {
  const out: string[] = [];
  for (const paragraph of clean(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      // Split long codes/URLs as well as normal words.
      for (const piece of word.match(/.{1,45}/g) || ['']) {
        if (font.widthOfTextAtSize(line + ' ' + piece, size) > width && line) { out.push(line); line = ''; }
        line += (line ? ' ' : '') + piece;
      }
    }
    out.push(line);
  }
  return out;
}
export async function buildRtccPrefix(input: BuildInput, baseLabels: PageLabel[], offset: number, supportingLabels:PageLabel[]=[], tablePages=0): Promise<Result> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(.60,.74,.89), white = rgb(1,1,1), ink = rgb(.12,.15,.2), border = rgb(.5,.56,.64);
  const labels: PageLabel[] = [];
  const refText = (docId: string) => {
    const attachmentHits=supportingLabels.flatMap((l,i)=>l.docId===docId?[tablePages+i+1]:[]);
    if(attachmentHits.length)return `RTCC attachment - ${supportingLabels.find(l=>l.docId===docId)!.label}, page${attachmentHits.length>1?'s':''} ${attachmentHits.join(', ')}`;
    const hits = baseLabels.flatMap((l,i) => l.docId === docId ? [i+1+offset] : []);
    const secIndex = input.sections.findIndex(s => s.files.some(f => f.id === docId));
    if (!hits.length || secIndex < 0) throw new Error('An RTCC supporting document is missing. Reattach it or update the reference.');
    return `Section ${secIndex+1} - ${input.sections[secIndex].title}, page${hits.length > 1 ? 's' : ''} ${hits[0]}${hits.length > 1 ? '-' + hits[hits.length-1] : ''}`;
  };
  for (const round of [...(input.rtcc || [])].sort((a,b) => b.number-a.number)) {
    const name = `RTCC ${String(round.number).padStart(2,'0')}`;
    if (round.source && !round.sourceFile) throw new Error(`${name}: consultant source file is missing.`);
    if (round.sourceFile) {
      const source = await PDFDocument.load(round.sourceFile.bytes.slice(0));
      for (const page of await doc.copyPages(source, source.getPageIndices())) { doc.addPage(page); labels.push({label: `${name} - Consultant comments`, kind:'doc'}); }
    }
    let page = doc.addPage([842,595]), y = 0, comparisonMode = false;
    const start = (comparison = false) => {
      comparisonMode = comparison;
      labels.push({label: `${name} - ${comparison ? 'Technical comparison' : 'Reply to consultant comments'}`, kind:'doc'});
      page.drawRectangle({x:24,y:551,width:794,height:24,color:blue});
      page.drawText(`${name} | ${comparison ? 'Technical comparison' : 'Reply to Consultant Comments'}`, {x:34,y:558,font:bold,size:12,color:ink});
      const details = input.fields.filter(f => f.value.trim()).map(f=>`${f.label}: ${f.value}`).join('   |   ');
      const projectLines = lines(details || input.title, font, 774, 8);
      if (projectLines.length > 10) throw new Error('RTCC project header is too long. Shorten project details before building.');
      y = 537;
      for (const l of projectLines) { page.drawText(l,{x:34,y,font,size:8,color:ink}); y-=11; }
      y-=6;
      tableRow(comparison ? ['No.','Requirement / offered alternative','Justification and evidence'] : ['No.','Consultant comments','Reply to consultant comments'], true);
    };
    const tableRow = (values: string[], header = false, heading = false) => {
      const widths=[48,402,344], xs=[24,72,474];
      const cells=values.map((v,i)=>lines(v,header||heading?bold:font,widths[i]-12));
      let remaining=Math.max(...cells.map(c=>c.length)); let lineAt=0;
      do {
        if (y < 61) { page=doc.addPage([842,595]); start(comparisonMode); }
        const take=Math.min(remaining,Math.max(1,Math.floor((y-42)/10)-1));
        const h=Math.max(24,take*10+10);
        for(let i=0;i<3;i++) {
          page.drawRectangle({x:xs[i],y:y-h,width:widths[i],height:h,color:header||heading?blue:white,borderColor:border,borderWidth:.5});
          cells[i].slice(lineAt,lineAt+take).forEach((l,j)=>page.drawText(l,{x:xs[i]+6,y:y-14-j*10,font:header||heading?bold:font,size:8,color:ink}));
        }
        y-=h; lineAt+=take; remaining-=take;
      } while(remaining>0);
    };
    start();
    for (const [i,row] of round.rows.entries()) {
      if(!requiresReply(row)){tableRow([row.sourceNumber||String(i+1),row.comment,noReplyText(row)],false,row.kind==='heading');continue;}
      const refs=[...new Set([...row.evidence.map(e=>e.docId),...(row.supportingDocIds||[])])].map(refText);
      const reply=row.reply.trim() || '[Reply pending]';
      tableRow([row.sourceNumber || String(i+1),row.comment,`${reply}${refs.length ? '\nPlease refer to '+[...new Set(refs)].join('; ')+'.' : ''}`]);
    }
    const comparisons=round.rows.filter(r=>requiresReply(r)&&r.comparison&&(r.comparison.offered.trim()||r.comparison.justification.trim()));
    if(comparisons.length) {
      page=doc.addPage([842,595]); start(true);
      comparisons.forEach(row=>tableRow([row.sourceNumber || String(round.rows.indexOf(row)+1),`Required: ${row.comparison!.requirement}\nOffered: ${row.comparison!.offered}`,`${row.comparison!.justification}\n${row.evidence.map(e=>refText(e.docId)+'\nEvidence: '+e.quote).join('\n')}`]));
    }
  }
  return {bytes:await doc.save(),labels,skipped:[]};
}
export async function buildWithRtcc(input: BuildInput, core: (i: BuildInput)=>Promise<Result>): Promise<Result> {
  const rounds=input.rtcc||[],linked=new Set(orderedRtccAttachments(rounds).map(r=>r.docId));
  const files=new Map(input.sections.flatMap(s=>s.files).filter(f=>f.id).map(f=>[f.id!,f]));
  const attachments=await buildRtccAttachments(rounds,async id=>files.get(id));
  const bodyInput={...input,sections:input.sections.map(s=>({...s,files:s.files.filter(f=>!f.id||!linked.has(f.id))})).filter((s,i)=>s.files.length||!input.sections[i].files.length)};
  const base=await core({...bodyInput,rtcc:undefined,pageOffset:0});
  let offset=0,tablePages=0,prefix:Result|undefined;
  for(let n=0;n<8;n++){
    prefix=await buildRtccPrefix(bodyInput,base.labels,offset,attachments.labels,tablePages);
    const total=prefix.labels.length+attachments.labels.length;
    if(total===offset)break;
    tablePages=prefix.labels.length;offset=total;prefix=undefined;
  }
  if(!prefix)throw new Error('RTCC pagination did not settle. Shorten replies and try again.');
  const body=await core({...bodyInput,rtcc:undefined,pageOffset:offset});
  const merged=await PDFDocument.load(prefix.bytes);
  if(attachments.bytes){const support=await PDFDocument.load(attachments.bytes);for(const page of await merged.copyPages(support,support.getPageIndices()))merged.addPage(page);}
  const font=await merged.embedFont(StandardFonts.Helvetica);
  merged.getPages().forEach((p,i)=> {
    // Add a footer outside original consultant artwork, never stamp over comments.
    const box=p.getMediaBox(); p.setMediaBox(box.x,box.y-22,box.width,box.height+22); p.setCropBox(box.x,box.y-22,box.width,box.height+22);
    p.drawText(`PAGE ${i+1} / ${offset+body.labels.length}`,{x:box.x+24,y:box.y-14,size:8,font});
  });
  const bodyDoc=await PDFDocument.load(body.bytes);
  for(const p of await merged.copyPages(bodyDoc,bodyDoc.getPageIndices())) merged.addPage(p);
  return {bytes:await merged.save(),labels:[...prefix.labels,...attachments.labels,...body.labels],skipped:body.skipped};
}

