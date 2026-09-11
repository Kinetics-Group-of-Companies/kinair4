import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const db=supabase as any;
type Product={id:string;name:string;description:string|null;submittal_product_models:{id:string;name:string;code:string|null;description:string|null}[]};
export function SubmittalProducts(){
 const {user,tenantId}=useAuth();const qc=useQueryClient();const {toast}=useToast();const [productId,setProductId]=useState('');
 const key=['submittal-products',tenantId];
 const q=useQuery({queryKey:key,enabled:!!tenantId,queryFn:async()=>{const {data,error}=await db.from('submittal_products').select('id,name,description,submittal_product_models(id,name,code,description)').eq('tenant_id',tenantId).order('name');if(error)throw error;return(data??[]) as Product[]}});
 const refresh=()=>qc.invalidateQueries({queryKey:key});
 const addProduct=useMutation({mutationFn:async(v:{name:string;description:string})=>{const {error}=await db.from('submittal_products').insert({tenant_id:tenantId,created_by:user!.id,...v});if(error)throw error},onSuccess:refresh});
 const addModel=useMutation({mutationFn:async(v:{product_id:string;name:string;code:string})=>{const {error}=await db.from('submittal_product_models').insert({tenant_id:tenantId,created_by:user!.id,...v});if(error)throw error},onSuccess:refresh});
 const remove=useMutation({mutationFn:async(v:{table:string;id:string})=>{const {error}=await db.from(v.table).delete().eq('id',v.id);if(error)throw error},onSuccess:refresh});
 async function productSubmit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await addProduct.mutateAsync({name:String(f.get('name')),description:String(f.get('description')||'')});e.currentTarget.reset();toast({title:'Product added'})}catch(x){toast({title:'Unable to add product',description:x instanceof Error?x.message:'Please retry',variant:'destructive'})}}
 async function modelSubmit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await addModel.mutateAsync({product_id:productId,name:String(f.get('name')),code:String(f.get('code')||'')});e.currentTarget.reset();toast({title:'Model added'})}catch(x){toast({title:'Unable to add model',description:x instanceof Error?x.message:'Please retry',variant:'destructive'})}}
 return <div className="space-y-5"><Card><CardHeader><CardTitle>Product List</CardTitle><CardDescription>Create categories and models for controlled submittals.</CardDescription></CardHeader><CardContent><form onSubmit={productSubmit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><div><Label htmlFor="pn">Product name</Label><Input id="pn" name="name" required/></div><div><Label htmlFor="pd">Description</Label><Input id="pd" name="description"/></div><Button className="self-end"><Plus className="h-4 w-4"/>Add product</Button></form></CardContent></Card>
 {(q.data??[]).map(p=><Card key={p.id}><CardHeader><div className="flex justify-between gap-3"><div><CardTitle>{p.name}</CardTitle><CardDescription>{p.submittal_product_models.length} models · {p.description||'No description'}</CardDescription></div><Button variant="ghost" size="icon" aria-label={'Delete '+p.name} onClick={()=>remove.mutate({table:'submittal_products',id:p.id})}><Trash2 className="h-4 w-4 text-destructive"/></Button></div></CardHeader><CardContent className="space-y-3">{p.submittal_product_models.map(m=><div key={m.id} className="flex items-center justify-between rounded-md border p-3"><div><b>{m.name}</b>{m.code&&<span className="ml-2 text-sm text-muted-foreground">{m.code}</span>}</div><Button variant="ghost" size="icon" aria-label={'Delete '+m.name} onClick={()=>remove.mutate({table:'submittal_product_models',id:m.id})}><Trash2 className="h-4 w-4"/></Button></div>)}<form onSubmit={modelSubmit} onFocus={()=>setProductId(p.id)} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"><Input name="name" placeholder="Model name" required/><Input name="code" placeholder="Model code"/><Button variant="outline">Add model</Button></form></CardContent></Card>)}
 {!q.isLoading&&(q.data??[]).length===0&&<div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">No products yet.</div>}</div>
}