import { FormEvent, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart3, FilePlus2, FileText, FolderOpen, LayoutDashboard, Library, PackagePlus, Settings2, Wrench } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/authContext';
import { useSubmittals, type SubmittalDraft, type SubmittalKind } from '@/hooks/useSubmittals';
import { SubmittalProducts } from '@/components/submittal/SubmittalProducts';

type Section = 'overview' | 'new' | 'pq' | 'om' | 'products' | 'reports' | 'documents' | 'templates';
const sections = [
  ['overview','Overview',LayoutDashboard],['new','New Submittal',FilePlus2],['pq','New PQ Submittal',PackagePlus],
  ['om','New O&M Submittal',Wrench],['products','Product List',Library],['reports','Reports',BarChart3],
  ['documents','Documents',FolderOpen],['templates','Templates',Settings2],
] as const;

export default function SubmittalControlPage() {
  const { user, isLoading } = useAuth();
  const { packages, save } = useSubmittals();
  const [section,setSection] = useState<Section>('overview');
  if (isLoading) return <MainLayout><div className="flex h-64 items-center justify-center">Loading…</div></MainLayout>;
  if (!user) return <Navigate to="/login" replace />;
  const rows = packages.data ?? [];
  return <MainLayout>
    <header className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background px-4 py-8"><div className="mx-auto max-w-7xl flex items-center gap-3"><FileText className="h-8 w-8 text-primary"/><div><h1 className="text-3xl font-bold">Submittal Control</h1><p className="text-muted-foreground">Controlled Regular, PQ and O&amp;M document packages.</p></div></div></header>
    <div className="mx-auto grid max-w-7xl gap-5 p-4 md:p-6 lg:grid-cols-[230px_1fr]">
      <Card className="h-fit"><CardContent className="p-2"><nav className="grid gap-1">{sections.map(([id,label,Icon])=><Button key={id} variant={section===id?'secondary':'ghost'} className="justify-start" onClick={()=>setSection(id)}><Icon className="h-4 w-4"/>{label}</Button>)}</nav></CardContent></Card>
      <section>
        {section==='overview'&&<Overview rows={rows} loading={packages.isLoading} onCreate={setSection}/>}
        {(['new','pq','om'] as Section[]).includes(section)&&<SubmittalForm kind={section==='new'?'regular':section} saving={save.isPending} onSave={async d=>{await save.mutateAsync(d);setSection('overview');}}/>}
        {section==='products'&&<SubmittalProducts/>}
        {section==='reports'&&<Reports rows={rows}/>}
        {section==='documents'&&<Module title="Standard Documents" text="Company profiles, trade licences, compliance statements, policies, organisation charts and approvals." action="Upload document"/>}
        {section==='templates'&&<Module title="Templates & Stamps" text="Company cover, index and divider templates, field maps and stamps." action="Upload template"/>}
      </section>
    </div>
  </MainLayout>;
}

function Overview({rows,loading,onCreate}:{rows:any[];loading:boolean;onCreate:(s:Section)=>void}) {
 const stats=useMemo(()=>({total:rows.length,done:rows.filter(r=>r.status==='generated').length,draft:rows.filter(r=>r.status!=='generated').length}),[rows]);
 return <div className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-semibold">Overview</h2><p className="text-sm text-muted-foreground">All package types in one controlled register.</p></div><div className="flex gap-2"><Button onClick={()=>onCreate('new')}>New</Button><Button variant="outline" onClick={()=>onCreate('pq')}>New PQ</Button><Button variant="outline" onClick={()=>onCreate('om')}>New O&amp;M</Button></div></div>
 <div className="grid gap-3 sm:grid-cols-3">{[['Total packages',stats.total],['Completed',stats.done],['Draft / failed',stats.draft]].map(([l,v])=><Card key={l}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{l}</p><p className="text-3xl font-bold">{v}</p></CardContent></Card>)}</div>
 <Register rows={rows} loading={loading}/></div>;
}
function Register({rows,loading}:{rows:any[];loading:boolean}) {return <Card><CardHeader><CardTitle>Submittal register</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Project</TableHead><TableHead>Type</TableHead><TableHead>Revision</TableHead><TableHead>Status</TableHead><TableHead>Approval</TableHead></TableRow></TableHeader><TableBody>{loading?<TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>:rows.length===0?<TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No submittals yet.</TableCell></TableRow>:rows.map(r=><TableRow key={r.id}><TableCell>{r.submission_date}</TableCell><TableCell>{r.reference||'—'}</TableCell><TableCell>{r.project_name}</TableCell><TableCell className="uppercase">{r.package_type}</TableCell><TableCell>R{r.revision}</TableCell><TableCell><Badge>{r.status}</Badge></TableCell><TableCell>{r.approval_status.replace('_',' ')}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
function SubmittalForm({kind,saving,onSave}:{kind:SubmittalKind;saving:boolean;onSave:(d:SubmittalDraft)=>Promise<void>}) {
 const {toast}=useToast();
 const title=kind==='pq'?'New PQ Submittal':kind==='om'?'New O&M Submittal':'New Submittal';
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await onSave({package_type:kind,status:(f.get('intent')==='generate'?'generated':'draft'),reference:String(f.get('reference')||'')||null,revision:Number(f.get('revision')||0),quotation_reference:String(f.get('quotation_reference')||'')||null,quotation_value:f.get('quotation_value')?Number(f.get('quotation_value')):null,sales_engineer:String(f.get('sales_engineer')||'')||null,project_name:String(f.get('project_name')||''),material:String(f.get('material')||'')||null,client_name:String(f.get('client_name')||'')||null,consultant_name:String(f.get('consultant_name')||'')||null,main_contractor_name:String(f.get('main_contractor_name')||'')||null,subcontractor_name:String(f.get('subcontractor_name')||'')||null,submission_date:String(f.get('submission_date')),equipment_tag:String(f.get('equipment_tag')||'')||null,commissioning_date:String(f.get('commissioning_date')||'')||null,warranty_period:String(f.get('warranty_period')||'')||null});toast({title:'Submittal saved'});}catch(error){toast({title:'Unable to save',description:error instanceof Error?error.message:'Please retry',variant:'destructive'});}}
 return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Enter the information exactly as it must appear in the package.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field name="reference" label="Reference"/><Field name="revision" label="Revision" type="number" defaultValue="0"/><Field name="submission_date" label="Submission date" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/><Field name="quotation_reference" label="QTN REF"/><Field name="quotation_value" label="QTN Value" type="number"/><Field name="sales_engineer" label="Sales Engineer"/><Field name="project_name" label="Project Name" required/><Field name="material" label="Material / Submittal For"/><Field name="client_name" label="Client"/><Field name="consultant_name" label="Consultant"/><Field name="main_contractor_name" label="Main Contractor"/><Field name="subcontractor_name" label="MEP Contractor"/>{kind==='om'&&<><Field name="equipment_tag" label="Equipment tag / system"/><Field name="commissioning_date" label="Commissioning date" type="date"/><Field name="warranty_period" label="Warranty period"/></>}</div><div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Product selection, controlled attachments and custom divider sections are connected in the next workspace panels.</div><div className="flex justify-end gap-2"><Button disabled={saving} name="intent" value="draft" variant="outline">Save draft</Button><Button disabled={saving} name="intent" value="generate">Create package</Button></div></form></CardContent></Card>;
}
function Field({label,...p}:React.ComponentProps<typeof Input>&{label:string}){const id=String(p.name);return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id}{...p}/></div>}
function Reports({rows}:{rows:any[]}){return <div className="space-y-4"><Card><CardHeader><CardTitle>Reports</CardTitle><CardDescription>Regular, PQ and O&amp;M package register.</CardDescription></CardHeader><CardContent><Button onClick={()=>{const csv=['Date,Reference,Project,Type,Revision,Status,Approval',...rows.map(r=>[r.submission_date,r.reference,r.project_name,r.package_type,r.revision,r.status,r.approval_status].map((v:any)=>JSON.stringify(v??'')).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='kinair-submittals.csv';a.click();URL.revokeObjectURL(a.href);}}>Download report</Button></CardContent></Card><Register rows={rows} loading={false}/></div>}
function Module({title,text,action}:{title:string;text:string;action:string}){return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{text}</CardDescription></CardHeader><CardContent><div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border border-dashed"><p className="text-muted-foreground">No records yet.</p><Button>{action}</Button></div></CardContent></Card>}
