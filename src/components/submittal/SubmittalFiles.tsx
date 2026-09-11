import { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const db=supabase as any;
const BUCKET='submittal-control';
const safe=(v:string)=>v.replace(/[^a-zA-Z0-9._-]+/g,'-');
type Doc={id:string;category:string;display_name:string;storage_path:string;company_name:string|null;created_at:string};
type Template={id:string;company_name:string;template_type:'cover'|'index'|'divider'|'stamp';display_name:string;storage_path:string;field_map:Record<string,unknown>};

function useFiles(table:'submittal_documents'|'submittal_templates'){
 const {user,tenantId}=useAuth();const qc=useQueryClient();const key=[table,tenantId];
 const list=useQuery({queryKey:key,enabled:!!tenantId,queryFn:async()=>{const {data,error}=await db.from(table).select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false});if(error)throw error;return data??[]}});
 const upload=useMutation({mutationFn:async(v:{file:File;record:Record<string,unknown>})=>{if(!user||!tenantId)throw new Error('Sign in required');const path=`${tenantId}/${table}/${crypto.randomUUID()}-${safe(v.file.name)}`;const {error:storageError}=await db.storage.from(BUCKET).upload(path,v.file,{contentType:v.file.type,upsert:false});if(storageError)throw storageError;const {error}=await db.from(table).insert({tenant_id:tenantId,created_by:user.id,storage_path:path,...v.record});if(error){await db.storage.from(BUCKET).remove([path]);throw error}},onSuccess:()=>qc.invalidateQueries({queryKey:key})});
 const remove=useMutation({mutationFn:async(v:{id:string;path:string})=>{const {error}=await db.from(table).delete().eq('id',v.id);if(error)throw error;await db.storage.from(BUCKET).remove([v.path])},onSuccess:()=>qc.invalidateQueries({queryKey:key})});
 return {list,upload,remove};
}
export function SubmittalDocuments(){
 const f=useFiles('submittal_documents');const {toast}=useToast();
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const d=new FormData(form);const file=d.get('file');if(!(file instanceof File)||!file.size)return;try{await f.upload.mutateAsync({file,record:{display_name:String(d.get('display_name')||file.name),category:String(d.get('category')),company_name:String(d.get('company_name')||'')||null}});form.reset();toast({title:'Document uploaded'})}catch(x){toast({title:'Upload failed',description:x instanceof Error?x.message:'Please retry',variant:'destructive'})}}
 return <FilePanel title="Standard Documents" description="Upload controlled PDFs used across packages." onSubmit={submit} pending={f.upload.isPending} fields={<><Field name="display_name" label="Display name"/><Field name="category" label="Category" required placeholder="Company Profile, Trade License…"/><Field name="company_name" label="Company"/></>} rows={(f.list.data??[]) as Doc[]} remove={f.remove.mutate}/>;
}
export function SubmittalTemplates(){
 const f=useFiles('submittal_templates');const {toast}=useToast();
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const d=new FormData(form);const file=d.get('file');if(!(file instanceof File)||!file.size)return;let field_map={};try{field_map=JSON.parse(String(d.get('field_map')||'{}'))}catch{toast({title:'Invalid field-map JSON',variant:'destructive'});return}try{await f.upload.mutateAsync({file,record:{display_name:String(d.get('display_name')||file.name),company_name:String(d.get('company_name')),template_type:String(d.get('template_type')),field_map}});form.reset();toast({title:String(d.get('template_type'))==='stamp'?'Company stamp uploaded':'Template uploaded'})}catch(x){toast({title:'Upload failed',description:x instanceof Error?x.message:'Please retry',variant:'destructive'})}}
 return <FilePanel title="Templates & Company Stamps" description="Upload cover, index, divider templates and PNG/JPEG stamps." onSubmit={submit} pending={f.upload.isPending} fields={<><Field name="display_name" label="Display name"/><Field name="company_name" label="Company" required/><div className="space-y-1"><Label>Type</Label><select name="template_type" className="h-10 w-full rounded-md border bg-background px-3"><option value="cover">Cover</option><option value="index">Index</option><option value="divider">Divider</option><option value="stamp">Company stamp</option></select></div><Field name="field_map" label="Field map JSON" defaultValue="{}"/></>} rows={(f.list.data??[]) as Template[]} remove={f.remove.mutate}/>;
}
function FilePanel({title,description,onSubmit,pending,fields,rows,remove}:{title:string;description:string;onSubmit:(e:FormEvent<HTMLFormElement>)=>void;pending:boolean;fields:React.ReactNode;rows:any[];remove:(v:{id:string;path:string})=>void}){return <div className="space-y-5"><Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">{fields}<div className="space-y-1"><Label>File</Label><Input name="file" type="file" accept=".pdf,image/png,image/jpeg" required/></div><Button disabled={pending} className="self-end"><Upload className="h-4 w-4"/>Upload</Button></form></CardContent></Card><div className="grid gap-3">{rows.map(r=><Card key={r.id}><CardContent className="flex items-center justify-between p-4"><div className="flex gap-3"><FileText className="h-5 w-5 text-primary"/><div><b>{r.display_name}</b><p className="text-xs text-muted-foreground">{r.category||r.template_type}{r.company_name?` · ${r.company_name}`:''}</p></div></div><Button variant="ghost" size="icon" aria-label={'Delete '+r.display_name} onClick={()=>remove({id:r.id,path:r.storage_path})}><Trash2 className="h-4 w-4 text-destructive"/></Button></CardContent></Card>)}{rows.length===0&&<div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">No files uploaded.</div>}</div></div>}
function Field({label,...p}:React.ComponentProps<typeof Input>&{label:string}){return <div className="space-y-1"><Label>{label}</Label><Input {...p}/></div>}
