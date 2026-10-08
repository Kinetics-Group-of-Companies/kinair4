import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Template={id:string;label:string;category:string;text:string;conflicts?:string[]};
export const quickReplyTemplates:Template[]=[
 {id:'noted',label:'Noted',category:'Common',text:'Noted.'},
 {id:'comply',label:'Comply',category:'Common',text:'Complies with the specified requirement.',conflicts:['deviation','cannot']},
 {id:'documents',label:'Refer to documents',category:'Common',text:'Please refer to {Document / drawing reference} for the supporting details.'},
 {id:'clarify',label:'Clarification needed',category:'Common',text:'Please clarify {Clarification needed} so we can confirm our response.'},
 {id:'contractor',label:'Contractor scope',category:'Common',text:'{Scope item} is under the contractor’s scope of work.',conflicts:['supplier']},
 {id:'supplier',label:'Supplier scope',category:'Common',text:'{Scope item} is included in the supplier’s scope of supply.',conflicts:['contractor']},
 {id:'equivalent',label:'Equivalent alternative',category:'Technical',text:'The specified requirement is {Specified requirement}. We propose {Offered alternative} as an equivalent alternative, based on {Technical justification}, subject to consultant approval.'},
 {id:'superior',label:'Improved performance',category:'Technical',text:'The offered {Offered parameter / value} exceeds the specified {Specified parameter / value} in respect of {Comparison basis}. Please refer to {Evidence reference}; acceptance remains subject to consultant review.'},
 {id:'deviation',label:'Deviation for approval',category:'Technical',text:'The deviation from {Specified requirement} is {Proposed deviation}. The justification is {Technical justification}. Consultant approval is requested.',conflicts:['comply']},
 {id:'cannot',label:'Cannot comply',category:'Technical',text:'We cannot comply with {Specified requirement} due to {Reason}. We propose {Proposed resolution} for consultant review.',conflicts:['comply']},
 {id:'material',label:'Material / finish',category:'Technical',text:'The offered construction is {Material and finish}. Please refer to {Document / drawing reference} for details.'},
 {id:'duty',label:'Duty / performance',category:'Technical',text:'The proposed duty is {Airflow and pressure / capacity}, at {Operating conditions}. Please refer to {Performance data reference}.'},
 {id:'electrical',label:'Electrical / motor',category:'Technical',text:'The offered electrical supply is {Voltage / phase / frequency}, with {Motor rating and protection}. Refer to {Document / drawing reference}.'},
 {id:'bms',label:'Controls / BMS',category:'Technical',text:'The proposed controls / BMS interface is {Controls and interface details}. Integration responsibility is {Integration responsibility}.'},
 {id:'certificate',label:'Test / certificate',category:'Documents',text:'Please refer to {Certificate / test report reference}. Its applicability to the proposed model is {Applicability details}.'},
 {id:'revision',label:'Revised submission',category:'Documents',text:'Please refer to revision {Revision reference}, addressing {Changes made}.'},
 {id:'pending',label:'Document to follow',category:'Documents',text:'{Pending document} will be submitted by {Target date / milestone}, subject to confirmation.'},
 {id:'coordination',label:'Site coordination',category:'Execution',text:'{Coordination item} will be coordinated with {Responsible party} before {Stage / activity}.'},
 {id:'installation',label:'Installation / maintenance',category:'Execution',text:'Please refer to {Installation / O&M reference} for {Installation or maintenance detail}.'},
 {id:'warranty',label:'Warranty terms',category:'Commercial',text:'The offered warranty is {Warranty duration}, commencing from {Warranty start condition}, subject to {Warranty conditions}.'},
 {id:'exclusion',label:'Scope exclusion',category:'Commercial',text:'{Excluded item} is excluded from the offered scope. Responsibility / proposed arrangement: {Responsible party / arrangement}.'},
 {id:'custom',label:'Custom wording',category:'Common',text:'{Custom wording}'},
];
export function composeQuickReply(ids:string[],values:Record<string,string>):string {
 return ids.map(id=>quickReplyTemplates.find(t=>t.id===id)).filter((t):t is Template=>!!t).map(t=>t.text.replace(/\{([^}]+)\}/g,(_,field:string)=>values[field]?.trim()||`{${field}}`)).join('\n\n');
}
export function QuickReplyComposer({onInsert}:{onInsert:(text:string)=>void}){
 const [selected,setSelected]=useState<string[]>([]),[values,setValues]=useState<Record<string,string>>({});
 const [category,setCategory]=useState('Common'),[search,setSearch]=useState(''),[notice,setNotice]=useState('');
 const templates=selected.map(id=>quickReplyTemplates.find(t=>t.id===id)!);
 const fields=[...new Set(templates.flatMap(t=>[...t.text.matchAll(/\{([^}]+)\}/g)].map(m=>m[1])))];
 const missing=fields.filter(f=>!values[f]?.trim());
 const draft=composeQuickReply(selected,values);
 const toggle=(template:Template)=>{
  setNotice('');
  if(selected.includes(template.id)){setSelected(selected.filter(id=>id!==template.id));return;}
  const conflict=templates.find(t=>template.conflicts?.includes(t.id)||t.conflicts?.includes(template.id));
  if(conflict){setNotice(`“${template.label}” conflicts with “${conflict.label}”. Deselect the conflicting choice first.`);return;}
  setSelected([...selected,template.id]);
 };
 const move=(index:number,step:number)=>{const next=[...selected];[next[index],next[index+step]]=[next[index+step],next[index]];setSelected(next);};
 return <section aria-label="Multi-select quick replies" className="space-y-3 rounded-lg border bg-muted/20 p-3">
  <div><h4 className="font-semibold">Build a quick reply</h4><p className="text-sm text-muted-foreground">Select multiple choices, fill in details, then insert together. Your existing reply stays unchanged.</p></div>
  <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Category<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"><option>All</option>{[...new Set(quickReplyTemplates.map(t=>t.category))].map(c=><option key={c}>{c}</option>)}</select></label><label className="text-sm">Find quick reply<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search all templates…" className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"/></label></div>
  <div className="grid gap-2 sm:grid-cols-2">{quickReplyTemplates.filter(t=>(search.trim()||category==='All'||t.category===category)&&(t.label+' '+t.text).toLowerCase().includes(search.trim().toLowerCase())).map(t=><label key={t.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${selected.includes(t.id)?'border-primary bg-primary/10':'bg-background'}`}><input type="checkbox" className="h-5 w-5 shrink-0" checked={selected.includes(t.id)} onChange={()=>toggle(t)}/>{t.label}</label>)}</div>
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  {!!selected.length&&<>
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{selected.length} selected · order of insertion</p><Button type="button" variant="ghost" className="min-h-11" onClick={()=>{setSelected([]);setValues({});setNotice('');}}>Clear selection</Button></div>
   <ol className="space-y-2">{templates.map((t,i)=><li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2"><span className="min-w-0 flex-1 text-sm">{i+1}. {t.label}</span><Button type="button" variant="outline" className="min-h-11" aria-label={`Move ${t.label} up`} disabled={i===0} onClick={()=>move(i,-1)}>↑</Button><Button type="button" variant="outline" className="min-h-11" aria-label={`Move ${t.label} down`} disabled={i===templates.length-1} onClick={()=>move(i,1)}>↓</Button><Button type="button" variant="ghost" className="min-h-11" aria-label={`Remove ${t.label}`} onClick={()=>toggle(t)}>Remove</Button></li>)}</ol>
   {fields.map(field=><label key={field} className="block text-sm font-medium">{field}<Textarea value={values[field]||''} onChange={e=>setValues({...values,[field]:e.target.value})} placeholder={`Enter ${field.toLowerCase()}…`} rows={2} className="mt-1 text-base"/></label>)}
   <label className="block text-sm font-semibold">Combined draft preview<Textarea readOnly value={draft} rows={Math.min(12,Math.max(4,selected.length*2))} className="mt-1 text-base"/></label>
   {!!missing.length&&<p className="text-sm text-muted-foreground">Fill {missing.length} remaining detail{missing.length===1?'':'s'} before inserting.</p>}
   <Button type="button" className="min-h-12 w-full sm:w-auto" disabled={!!missing.length} onClick={()=>{onInsert(draft);setSelected([]);setValues({});setNotice('Selected wording added as a draft. Review the reply and evidence below.');}}>Insert {selected.length} selected replies</Button>
  </>}
  <p className="text-xs text-muted-foreground">Templates are editable draft wording, not verified technical conclusions. Attach supporting evidence and review before issuing.</p>
 </section>;
}
