import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
const db=supabase as any;
export function SubmittalActions({record}:{record:any}){
 const {user,tenantId}=useAuth();const qc=useQueryClient();const {toast}=useToast();const refresh=()=>qc.invalidateQueries({queryKey:['submittal-packages',tenantId]});
 const approval=useMutation({mutationFn:async(status:'approved'|'not_approved'|'no_update')=>{if(!user||!tenantId)throw new Error('Sign in required');const {error:e1}=await db.from('submittal_approval_events').insert({tenant_id:tenantId,package_id:record.id,status,recorded_by:user.id});if(e1)throw e1;const {error:e2}=await db.from('submittal_packages').update({approval_status:status,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',record.id);if(e2)throw e2},onSuccess:(_,s)=>{refresh();toast({title:s==='approved'?'Marked approved':s==='not_approved'?'Marked not approved':'Approval cleared'})}});
 const revise=useMutation({mutationFn:async()=>{if(!user||!tenantId)throw new Error('Sign in required');const {error:e1}=await db.from('submittal_package_revisions').insert({tenant_id:tenantId,package_id:record.id,revision:record.revision,snapshot:record,created_by:user.id});if(e1)throw e1;const {error:e2}=await db.from('submittal_packages').update({revision:record.revision+1,status:'draft',approval_status:'no_update',output_storage_path:null,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',record.id);if(e2)throw e2},onSuccess:()=>{refresh();toast({title:`Revision R${record.revision+1} created`})}});
 return <div className="flex gap-1"><Button size="icon" variant="ghost" title="New revision" disabled={revise.isPending} onClick={()=>revise.mutate()}><RotateCcw className="h-4 w-4"/></Button><Button size="icon" variant="ghost" title="Approved" onClick={()=>approval.mutate('approved')}><CheckCircle2 className="h-4 w-4 text-emerald-600"/></Button><Button size="icon" variant="ghost" title="Not approved" onClick={()=>approval.mutate('not_approved')}><XCircle className="h-4 w-4 text-destructive"/></Button></div>
}