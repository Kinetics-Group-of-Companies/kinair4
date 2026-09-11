import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, Sparkles, UploadCloud, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const db=supabase as any;
const BUCKET='submittal-control';
const DEFAULT_INDEX=['Company Profile','Trade License','Certificates','Authorization Letter','Project Specification','Compliance Statement','List of Materials / BOQ','Product Catalogue','Test Reports','Method Statement','Estidama Form','Warranty Certificate','Country of Origin','Previous Material Approvals / Project List'].join('\n');
type IndexSection={id?:string;name:string;source_label?:string;sort_order:number};
const normalize=(v:string)=>v.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const aliases:Record<string,string[]>={
 'company profile':['company profile'],
 'trade license':['trade license','commercial license'],
 'certificates':['certificates','certificate','ce certificate','cb certificate'],
 'authorization letter':['authorization letter','authorisation letter'],
 'project specification':['project specification','specification'],
 'compliance statement':['compliance statement','compliance statment'],
 'list of materials boq':['list of materials','boq','material schedule','equipment schedule'],
 'product catalogue':['product catalogue','product catalog','product data','technical data','datasheet'],
 'test reports':['test reports','test report'],
 'method statement':['method statement','method statment'],
 'estidama form':['estidama','sustainability'],
 'warranty certificate':['warranty certificate','warranty'],
 'country of origin':['country of origin','origin certificate'],
 'previous material approvals project list':['previous material approvals','previous approvals','project list','reference projects'],
};
const canonical=(name:string)=>{const n=normalize(name);return Object.entries(aliases).find(([,terms])=>terms.some(t=>n.includes(normalize(t))||normalize(t).includes(n)))?.[0]||n};
const parseIndex=(value:string):IndexSection[]=>value.split(/\r?\n/).map(v=>v.replace(/^\s*\d+[.)-]?\s*/,'').replace(/\s+\d+\s*$/,'').trim()).filter(Boolean).map((name,sort_order)=>({id:crypto.randomUUID(),name,source_label:name,sort_order}));

export function AdvancedSubmittalBuilder(){
 const {user,tenantId}=useAuth();const {toast}=useToast();const qc=useQueryClient();
 const [packageId,setPackageId]=useState('');const [indexText,setIndexText]=useState(DEFAULT_INDEX);const [selectedModels,setSelectedModels]=useState<Set<string>>(new Set());const [result,setResult]=useState<any>(null);
 const packages=useQuery({queryKey:['advanced-submittal-packages',tenantId],enabled:!!tenantId,queryFn:async()=>{const {data,error}=await db.from('submittal_packages').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data??[]}});
 const products=useQuery({queryKey:['advanced-submittal-products',tenantId],enabled:!!tenantId,queryFn:async()=>{const {data,error}=await db.from('submittal_products').select('id,name,submittal_product_models(id,name,code)').eq('tenant_id',tenantId).order('name');if(error)throw error;return data??[]}});
 const selectedPackage=packages.data?.find((p:any)=>p.id===packageId);
 const modelMap=useMemo(()=>new Map((products.data??[]).flatMap((p:any)=>p.submittal_product_models.map((m:any)=>[m.id,{...m,product_id:p.id,product_name:p.name}]))),[products.data]);

 function choosePackage(id:string){setPackageId(id);const p=packages.data?.find((x:any)=>x.id===id);if(Array.isArray(p?.index_sections)&&p.index_sections.length)setIndexText(p.index_sections.map((x:any)=>x.name).join('\n'));else setIndexText(DEFAULT_INDEX);setResult(p?.validation_report?.assembly||null);void loadSelections(id)}
 async function loadSelections(id:string){const {data}=await db.from('submittal_package_products').select('model_id').eq('package_id',id);setSelectedModels(new Set((data??[]).map((x:any)=>x.model_id).filter(Boolean)))}
 function toggle(id:string){setSelectedModels(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}

 const analyze=useMutation({mutationFn:async(file:File)=>{if(!user||!tenantId||!packageId)throw new Error('Select a saved package first');if(file.size>15*1024*1024)throw new Error('Cover/index file must be 15 MB or smaller');const path=`${tenantId}/customer-input/${packageId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));const {data,error}=await supabase.functions.invoke('submittal-analyze',{body:{packageId,storagePath:path,fileName:file.name,mimeType:file.type,fileData:btoa(binary)}});if(error)throw error;return data},onSuccess:data=>{setIndexText((data.sections??[]).map((x:any)=>x.name).join('\n')||DEFAULT_INDEX);toast({title:'Cover and index read',description:`${data.sections?.length||0} sections detected`});void qc.invalidateQueries({queryKey:['advanced-submittal-packages']})}});
 async function uploadSource(e:React.ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;try{await analyze.mutateAsync(file)}catch(x){toast({title:'Unable to read document',description:x instanceof Error?x.message:'Please retry',variant:'destructive'})}finally{e.target.value=''}}

 const build=useMutation({mutationFn:async()=>{
  if(!user||!tenantId||!packageId)throw new Error('Select a package');const sections=parseIndex(indexText);if(!sections.length)throw new Error('Enter at least one index section');
  const selected=[...selectedModels].map(id=>modelMap.get(id)).filter(Boolean) as any[];
  await db.from('submittal_package_products').delete().eq('package_id',packageId);
  if(selected.length){const {error}=await db.from('submittal_package_products').insert(selected.map(m=>({tenant_id:tenantId,package_id:packageId,product_id:m.product_id,model_id:m.id,created_by:user.id})));if(error)throw error}
  const {data:docs,error:docError}=await db.from('submittal_documents').select('*').eq('tenant_id',tenantId).eq('is_active',true);if(docError)throw docError;
  const selectedProductIds=new Set(selected.map(m=>m.product_id));const selectedModelIds=new Set(selected.map(m=>m.id));const selectedSeries=new Set(selected.map(m=>normalize(m.product_name)));
  const applicable=(d:any)=>d.scope_type==='company'||(d.scope_type==='project'&&d.package_id===packageId)||(d.scope_type==='product'&&selectedProductIds.has(d.product_id))||(d.scope_type==='model'&&selectedModelIds.has(d.model_id))||(d.scope_type==='series'&&selectedSeries.has(normalize(d.series_name||'')));
  const items:any[]=[];const summary:any[]=[];
  for(const section of sections){const key=canonical(section.name);const matches=(docs??[]).filter((d:any)=>{const terms=[d.category,d.display_name,...(d.keywords||[])].map((x:string)=>canonical(x||''));return applicable(d)&&terms.some((x:string)=>x===key||x.includes(key)||key.includes(x))}).sort((a:any,b:any)=>Number(Boolean(b.model_id))-Number(Boolean(a.model_id))||Number(Boolean(b.product_id))-Number(Boolean(a.product_id)));
   if(matches.length){for(const d of matches){const expired=d.expires_on&&new Date(d.expires_on)<new Date();items.push({tenant_id:tenantId,package_id:packageId,product_id:d.product_id,model_id:d.model_id,document_id:d.id,section_name:section.name,source_type:'library',display_name:d.display_name,storage_path:d.storage_path,sort_order:items.length,is_included:true,is_required:d.is_mandatory,validation_state:expired?'expired':'ready',notes:expired?'Document expiry date has passed':null})}summary.push({section:section.name,state:matches.some((d:any)=>d.expires_on&&new Date(d.expires_on)<new Date())?'warning':'ready',documents:matches.map((d:any)=>d.display_name)})}
   else{items.push({tenant_id:tenantId,package_id:packageId,section_name:section.name,source_type:'generated',display_name:'Missing document',sort_order:items.length,is_included:false,is_required:true,validation_state:'missing',notes:'Upload or map a document for this section'});summary.push({section:section.name,state:'missing',documents:[]})}}
  await db.from('submittal_package_items').delete().eq('package_id',packageId);const {error:itemError}=await db.from('submittal_package_items').insert(items);if(itemError)throw itemError;
  const report={assembly:summary,ready:summary.filter(x=>x.state==='ready').length,missing:summary.filter(x=>x.state==='missing').length,warnings:summary.filter(x=>x.state==='warning').length,checked_at:new Date().toISOString()};
  const {error:updateError}=await db.from('submittal_packages').update({index_sections:sections,validation_report:report,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',packageId);if(updateError)throw updateError;return report;
 },onSuccess:r=>{setResult(r.assembly);toast({title:'Automatic package prepared',description:`${r.ready} ready · ${r.missing} missing · ${r.warnings} warnings`});void qc.invalidateQueries({queryKey:['submittal-package-register']})}});

 const generate=useMutation({mutationFn:async()=>{if((result??[]).some((x:any)=>x.state==='missing'))throw new Error('Resolve missing sections before final generation');const {data,error}=await supabase.functions.invoke('submittal-pdf',{body:{packageId}});if(error)throw error;const blob=data instanceof Blob?data:new Blob([data],{type:'application/pdf'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${selectedPackage?.reference||'submittal'}-R${selectedPackage?.revision||0}.pdf`;a.click();URL.revokeObjectURL(a.href)},onSuccess:()=>toast({title:'Final submittal generated'})});
 const counts={ready:(result??[]).filter((x:any)=>x.state==='ready').length,missing:(result??[]).filter((x:any)=>x.state==='missing').length,warning:(result??[]).filter((x:any)=>x.state==='warning').length};
 return <div className="space-y-5">
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary"/>Automatic Submittal Builder</CardTitle><CardDescription>Provide only the customer cover/index and choose the proposed models. KINAIR maps the controlled documents and prepares the full package.</CardDescription></CardHeader><CardContent className="space-y-5">
   <div><Label>Saved package</Label><select value={packageId} onChange={e=>choosePackage(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Select package</option>{packages.data?.map((p:any)=><option key={p.id} value={p.id}>{p.reference||'Draft'} · {p.project_name}</option>)}</select></div>
   <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-lg border p-4"><Label>Customer cover/index file</Label><p className="mb-3 text-xs text-muted-foreground">PDF, PNG or JPEG. The system reads cover details and index order automatically.</p><Input type="file" accept=".pdf,image/png,image/jpeg" disabled={!packageId||analyze.isPending} onChange={uploadSource}/>{analyze.isPending&&<p className="mt-2 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Reading customer document…</p>}</div>
   <div className="rounded-lg border p-4"><Label>Manual index</Label><p className="mb-3 text-xs text-muted-foreground">One section per line. Edit the extracted index or enter it manually.</p><Textarea rows={10} value={indexText} onChange={e=>setIndexText(e.target.value)}/></div></div>
   <div><Label>Products and models in this submittal</Label><div className="mt-2 grid gap-2 md:grid-cols-2">{(products.data??[]).flatMap((p:any)=>p.submittal_product_models.map((m:any)=><label key={m.id} className="flex items-center gap-3 rounded-md border p-3"><input type="checkbox" checked={selectedModels.has(m.id)} onChange={()=>toggle(m.id)}/><span><b>{m.code||m.name}</b><small className="block text-muted-foreground">{p.name} · {m.name}</small></span></label>))}{!products.isLoading&&!(products.data??[]).some((p:any)=>p.submittal_product_models.length)&&<p className="text-sm text-muted-foreground">Add products and models in Product List first.</p>}</div></div>
   <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={!packageId||build.isPending} onClick={()=>build.mutate()}><FileSearch className="h-4 w-4"/>Validate & auto-build</Button><Button disabled={!packageId||!result||counts.missing>0||generate.isPending} onClick={()=>generate.mutate()}><UploadCloud className="h-4 w-4"/>Generate final submittal</Button></div>
  </CardContent></Card>
  {result&&<Card><CardHeader><CardTitle>Package readiness</CardTitle><CardDescription>{counts.ready} ready · {counts.missing} missing · {counts.warning} warnings. Actual contents page numbers are calculated during PDF assembly.</CardDescription></CardHeader><CardContent className="space-y-2">{result.map((r:any,i:number)=><div key={i} className="flex gap-3 rounded-md border p-3">{r.state==='ready'?<CheckCircle2 className="h-5 w-5 text-emerald-600"/>:r.state==='missing'?<XCircle className="h-5 w-5 text-destructive"/>:<AlertTriangle className="h-5 w-5 text-amber-600"/>}<div><b>{i+1}. {r.section}</b><p className="text-xs text-muted-foreground">{r.documents.length?r.documents.join(' · '):'No matching document. Upload or map one in Documents.'}</p></div></div>)}</CardContent></Card>}
 </div>
}
