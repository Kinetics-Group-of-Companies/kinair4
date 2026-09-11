import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, FileText, FolderOpen, LayoutDashboard, Library, WandSparkles } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/integrations/backend/client';
import { downloadSubmittalWorkbook } from '@/lib/submittalWorkbook';
import { useSubmittals } from '@/hooks/useSubmittals';
import { SubmittalProducts } from '@/components/submittal/SubmittalProducts';
import { SubmittalDocuments } from '@/components/submittal/SubmittalFiles';
import { SubmittalActions } from '@/components/submittal/SubmittalActions';
import { AdvancedSubmittalBuilder } from '@/components/submittal/AdvancedSubmittalBuilder';

type Section = 'builder' | 'overview' | 'products' | 'documents' | 'reports';
const sections = [
  ['builder','Build Submittal',WandSparkles],
  ['overview','Submittal Summary',LayoutDashboard],
  ['products','Products & Models',Library],
  ['documents','Default Documents',FolderOpen],
  ['reports','Reports',BarChart3],
] as const;

export default function SubmittalControlPage() {
  const { user, isLoading } = useAuth();
  const { packages, isLoading: packagesLoading } = useSubmittals();
  const [section,setSection] = useState<Section>('builder');
  if (isLoading) return <MainLayout><div className="flex h-64 items-center justify-center">Loading…</div></MainLayout>;
  if (!user) return <Navigate to="/login" replace />;
  const rows = packages;
  return <MainLayout>
    <header className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background px-4 py-8"><div className="mx-auto max-w-7xl flex items-center gap-3"><FileText className="h-8 w-8 text-primary"/><div><h1 className="text-3xl font-bold">Submittal Control</h1><p className="text-muted-foreground">Controlled Regular, PQ and O&amp;M document packages.</p></div></div></header>
    <div className="mx-auto grid max-w-7xl gap-5 p-4 md:p-6 lg:grid-cols-[230px_1fr]">
      <Card className="h-fit"><CardContent className="p-2"><nav className="grid gap-1">{sections.map(([id,label,Icon])=><Button key={id} variant={section===id?'secondary':'ghost'} className="justify-start" onClick={()=>setSection(id)}><Icon className="h-4 w-4"/>{label}</Button>)}</nav></CardContent></Card>
      <section>
        {section==='builder'&&<AdvancedSubmittalBuilder/>}
        {section==='overview'&&<Overview rows={rows} loading={packagesLoading} onCreate={setSection}/>}
        {section==='products'&&<SubmittalProducts/>}
        {section==='reports'&&<Reports rows={rows}/>}
        {section==='documents'&&<SubmittalDocuments/>}
      </section>
    </div>
  </MainLayout>;
}

function Overview({rows,loading,onCreate}:{rows:any[];loading:boolean;onCreate:(s:Section)=>void}) {
 const {tenantId}=useAuth();
 const links=useQuery({queryKey:['submittal-overview-products',tenantId],enabled:!!tenantId,queryFn:async()=>{const {data,error}=await (supabase as any).from('submittal_package_products').select('package_id,quantity,submittal_products(name)').eq('tenant_id',tenantId);if(error)throw error;return data??[]}});
 const analytics=useMemo(()=>{
  const product=new Map<string,Set<string>>(),sales=new Map<string,number>(),monthly=new Map<string,number>(),yearly=new Map<string,number>(),linked=new Set<string>();
  for(const link of links.data??[]){const raw=Array.isArray(link.submittal_products)?link.submittal_products[0]:link.submittal_products;const name=raw?.name||'Unassigned product';if(!product.has(name))product.set(name,new Set());product.get(name)!.add(link.package_id);linked.add(link.package_id)}
  for(const row of rows){if(!linked.has(row.id)){const name=row.material?.trim()||'Unassigned product';if(!product.has(name))product.set(name,new Set());product.get(name)!.add(row.id)}const engineer=row.sales_engineer?.trim()||'Unassigned';sales.set(engineer,(sales.get(engineer)||0)+1);const date=new Date(row.submission_date||row.created_at);if(!Number.isNaN(date.getTime())){const month=date.toISOString().slice(0,7);monthly.set(month,(monthly.get(month)||0)+1);const year=String(date.getUTCFullYear());yearly.set(year,(yearly.get(year)||0)+1)}}
  return {product:[...product].map(([name,ids])=>({name,count:ids.size})).sort((a,b)=>b.count-a.count),sales:[...sales].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),monthly:[...monthly].sort(([a],[b])=>a.localeCompare(b)).map(([key,count])=>({name:new Date(key+'-01T00:00:00Z').toLocaleDateString('en',{month:'short',year:'numeric',timeZone:'UTC'}),count})),yearly:[...yearly].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>({name,count}))};
 },[rows,links.data]);
 const stats=useMemo(()=>({total:rows.length,done:rows.filter(r=>r.status==='generated').length,draft:rows.filter(r=>r.status!=='generated').length,approved:rows.filter(r=>r.approval_status==='approved').length}),[rows]);
 return <div className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-semibold">Submittal Analytics</h2><p className="text-sm text-muted-foreground">Product, salesperson and submission trends from the controlled register.</p></div><Button onClick={()=>onCreate('builder')}><WandSparkles className="h-4 w-4"/>Build a submittal</Button></div>
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Total submittals',stats.total],['Generated',stats.done],['Draft / failed',stats.draft],['Approved',stats.approved]].map(([l,v])=><Card key={l}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{l}</p><p className="text-3xl font-bold">{v}</p></CardContent></Card>)}</div>
 <div className="grid gap-4 xl:grid-cols-2"><AnalyticsCard title="Submittals by product" description="Unique submittal packages containing each product."><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.product} layout="vertical" margin={{left:18,right:24}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={130}/><Tooltip/><Bar dataKey="count" name="Submittals" fill="hsl(var(--primary))" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></AnalyticsCard>
 <AnalyticsCard title="Submittals by salesperson" description="Number of packages handled by each sales engineer."><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.sales} layout="vertical" margin={{left:18,right:24}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={130}/><Tooltip/><Bar dataKey="count" name="Submittals" fill="hsl(var(--primary))" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></AnalyticsCard>
 <AnalyticsCard title="Monthly submittal trend" description="Submission volume by calendar month."><ResponsiveContainer width="100%" height="100%"><LineChart data={analytics.monthly} margin={{left:4,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" name="Submittals" stroke="hsl(var(--primary))" strokeWidth={3} dot={{r:4}}/></LineChart></ResponsiveContainer></AnalyticsCard>
 <AnalyticsCard title="Yearly submittal trend" description="Submission volume by calendar year."><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.yearly} margin={{left:4,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" name="Submittals" fill="hsl(var(--primary))" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></AnalyticsCard></div>
 <Register rows={rows} loading={loading}/></div>;
}
function AnalyticsCard({title,description,children}:{title:string;description:string;children:React.ReactNode}){return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div className="h-72">{children}</div></CardContent></Card>}
function Register({rows,loading}:{rows:any[];loading:boolean}) {const {toast}=useToast();const queryClient=useQueryClient();return <Card><CardHeader><CardTitle>Submittal register</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Project</TableHead><TableHead>Type</TableHead><TableHead>Revision</TableHead><TableHead>Status</TableHead><TableHead>Approval</TableHead><TableHead>PDF</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{loading?<TableRow><TableCell colSpan={9}>Loading…</TableCell></TableRow>:rows.length===0?<TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No submittals yet.</TableCell></TableRow>:rows.map(r=><TableRow key={r.id}><TableCell>{r.submission_date}</TableCell><TableCell>{r.reference||'—'}</TableCell><TableCell>{r.project_name}</TableCell><TableCell className="uppercase">{r.package_type}</TableCell><TableCell>R{r.revision}</TableCell><TableCell><Badge>{r.status}</Badge></TableCell><TableCell>{r.approval_status.replace('_',' ')}</TableCell><TableCell><Button size="sm" variant="outline" onClick={async()=>{const {data,error}=await supabase.functions.invoke('submittal-pdf',{body:{packageId:r.id,preview:true}});if(error){toast({title:'PDF generation failed',description:error.message,variant:'destructive'});return;}const blob=data instanceof Blob?data:new Blob([data],{type:'application/pdf'});window.open(URL.createObjectURL(blob),'_blank')}}>Preview</Button><Button size="sm" className="ml-2" onClick={async()=>{const {data,error}=await supabase.functions.invoke('submittal-pdf',{body:{packageId:r.id}});if(error){toast({title:'PDF generation failed',description:error.message,variant:'destructive'});return;}const blob=data instanceof Blob?data:new Blob([data],{type:'application/pdf'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(r.reference||'submittal')+'-R'+r.revision+'.pdf';a.click();URL.revokeObjectURL(a.href);await queryClient.invalidateQueries({queryKey:['submittal-package-register']})}}>Generate</Button></TableCell><TableCell><SubmittalActions record={r}/></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
function Reports({rows}:{rows:any[]}){return <div className="space-y-4"><Card><CardHeader><CardTitle>Excel Reports</CardTitle><CardDescription>Download one workbook with Summary, Submittals, PQ Submittals and O&amp;M Submittals worksheets.</CardDescription></CardHeader><CardContent><Button onClick={()=>downloadSubmittalWorkbook(rows)}>Download Excel workbook</Button></CardContent></Card><Register rows={rows} loading={false}/></div>}
