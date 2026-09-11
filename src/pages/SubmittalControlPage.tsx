import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart3, FilePlus2, FileText, FolderOpen, LayoutDashboard, Library, PackagePlus, Settings2, Wrench } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/authContext';

type Section = 'overview' | 'new' | 'pq' | 'om' | 'products' | 'reports' | 'documents' | 'templates';

const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'new', label: 'New Submittal', icon: FilePlus2 },
  { id: 'pq', label: 'New PQ Submittal', icon: PackagePlus },
  { id: 'om', label: 'New O&M Submittal', icon: Wrench },
  { id: 'products', label: 'Product List', icon: Library },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'templates', label: 'Templates', icon: Settings2 },
];

export default function SubmittalControlPage() {
  const { user, isLoading } = useAuth();
  const [section, setSection] = useState<Section>('overview');

  if (isLoading) return <MainLayout><div className="flex h-64 items-center justify-center">Loading…</div></MainLayout>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <MainLayout>
      <div className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Submittal Control</h1>
              <p className="text-muted-foreground">Create, control and report submission-ready document packages.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 p-4 md:p-6 lg:grid-cols-[230px_1fr]">
        <Card className="h-fit">
          <CardContent className="p-2">
            <nav className="grid gap-1" aria-label="Submittal Control">
              {sections.map(({ id, label, icon: Icon }) => (
                <Button key={id} variant={section === id ? 'secondary' : 'ghost'} className="justify-start" onClick={() => setSection(id)}>
                  <Icon className="h-4 w-4" />{label}
                </Button>
              ))}
            </nav>
          </CardContent>
        </Card>
        <section>
          {section === 'overview' && <Overview onCreate={setSection} />}
          {(['new', 'pq', 'om'] as Section[]).includes(section) && <SubmittalForm kind={section as 'new' | 'pq' | 'om'} />}
          {section === 'products' && <EmptyModule title="Product List" description="Create product categories and models, then attach shared and model-specific controlled documents." action="Add product model" />}
          {section === 'reports' && <EmptyModule title="Reports" description="Filter regular, PQ and O&M registers by period, status and approval, then export Excel reports." action="Download Excel" />}
          {section === 'documents' && <EmptyModule title="Standard Documents" description="Manage company profiles, trade licences, compliance statements, policies, organisation charts and approvals." action="Upload document" />}
          {section === 'templates' && <EmptyModule title="Templates & Stamps" description="Manage company-specific cover, index and divider templates, field maps and company stamps." action="Upload template" />}
        </section>
      </div>
    </MainLayout>
  );
}

function Overview({ onCreate }: { onCreate: (section: Section) => void }) {
  const cards = useMemo(() => [
    ['Total packages', '0'], ['Completed', '0'], ['Draft / failed', '0'], ['Products', '0'],
  ], []);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">Overview</h2><p className="text-sm text-muted-foreground">A fresh KINAIR workspace ready for its first package.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onCreate('new')}>New Submittal</Button>
        <Button variant="outline" onClick={() => onCreate('pq')}>New PQ</Button>
        <Button variant="outline" onClick={() => onCreate('om')}>New O&amp;M</Button>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <Card key={label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Submittal register</CardTitle><CardDescription>Regular, PQ and O&amp;M packages will appear here with revision, status, approval and download actions.</CardDescription></CardHeader><CardContent><div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">No submittals yet.</div></CardContent></Card>
  </div>;
}

function SubmittalForm({ kind }: { kind: 'new' | 'pq' | 'om' }) {
  const title = kind === 'pq' ? 'New PQ Submittal' : kind === 'om' ? 'New O&M Submittal' : 'New Submittal';
  return <Card>
    <CardHeader><div className="flex items-center gap-2"><CardTitle>{title}</CardTitle><Badge variant="secondary">Draft</Badge></div><CardDescription>Enter project information exactly as it should appear in the generated package.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Reference" placeholder="Submittal reference" />
        <Field label="Revision" placeholder="0" />
        <Field label="Submission date" type="date" />
        <Field label="Quotation reference" placeholder="QTN REF" />
        <Field label="Quotation value" type="number" placeholder="0.00" />
        <Field label="Sales engineer" />
        <Field label="Project name" />
        <Field label="Material / Submittal for" />
        <Field label="Client" />
        <Field label="Consultant" />
        <Field label="Main contractor" />
        <Field label="MEP contractor" />
      </div>
      {kind === 'om' && <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-3"><Field label="Equipment tag / system" /><Field label="Commissioning date" type="date" /><Field label="Warranty period" placeholder="e.g. 12 months" /></div>}
      <div className="grid gap-4 md:grid-cols-3">
        <EmptyStep title="1. Select products" text="Choose categories and model documents." />
        <EmptyStep title="2. Add sections" text={kind === 'om' ? 'O&M manuals, IOM, commissioning, warranty and as-built records.' : 'Add standard or custom divider sections and PDFs.'} />
        <EmptyStep title="3. Generate" text="Preview, validate and generate the controlled PDF." />
      </div>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline">Save draft</Button><Button variant="outline">Preview PDF</Button><Button>Create and generate PDF</Button></div>
    </CardContent>
  </Card>;
}

function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} {...props} /></div>;
}
function EmptyStep({ title, text }: { title: string; text: string }) {
  return <div className="rounded-lg border border-dashed p-4"><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>;
}
function EmptyModule({ title, description, action }: { title: string; description: string; action: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border border-dashed text-center"><p className="text-sm text-muted-foreground">No records yet.</p><Button>{action}</Button></div></CardContent></Card>;
}
