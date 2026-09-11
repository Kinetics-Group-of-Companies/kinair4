import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';

export type SubmittalKind = 'regular' | 'pq' | 'om';
export type SubmittalStatus = 'draft' | 'generated' | 'failed';
export type ApprovalStatus = 'no_update' | 'approved' | 'not_approved';

export interface SubmittalPackage {
  id: string;
  package_type: SubmittalKind;
  status: SubmittalStatus;
  approval_status: ApprovalStatus;
  reference: string | null;
  revision: number;
  quotation_reference: string | null;
  quotation_value: number | null;
  sales_engineer: string | null;
  project_name: string;
  material: string | null;
  client_name: string | null;
  consultant_name: string | null;
  main_contractor_name: string | null;
  subcontractor_name: string | null;
  submission_date: string;
  equipment_tag: string | null;
  commissioning_date: string | null;
  warranty_period: string | null;
  output_storage_path: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  editing_by: string | null;
  editing_at: string | null;
}

export type SubmittalDraft = Omit<SubmittalPackage, 'id' | 'approval_status' | 'output_storage_path' | 'created_at' | 'updated_at'>;

const db = supabase as any;

export function useSubmittals() {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();
  const key = ['submittal-package-register', tenantId];

  const packages = useQuery({
    queryKey: key,
    enabled: Boolean(user && tenantId),
    queryFn: async () => {
      const { data, error } = await db.from('submittal_packages')
        .select('*').eq('tenant_id', tenantId)
        .order('submission_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubmittalPackage[];
    },
  });

  useEffect(()=>{if(!tenantId)return;const channel=supabase.channel(`submittal-team-${tenantId}`).on('postgres_changes',{event:'*',schema:'public',table:'submittal_packages',filter:`tenant_id=eq.${tenantId}`},()=>void queryClient.invalidateQueries({queryKey:key})).on('postgres_changes',{event:'*',schema:'public',table:'submittal_package_items'},()=>void queryClient.invalidateQueries({queryKey:key})).on('postgres_changes',{event:'*',schema:'public',table:'submittal_package_products'},()=>void queryClient.invalidateQueries({queryKey:key})).subscribe();return()=>{void supabase.removeChannel(channel)}},[tenantId,queryClient]);

  const save = useMutation({
    mutationFn: async (draft: SubmittalDraft) => {
      if (!user || !tenantId) throw new Error('A signed-in tenant account is required.');
      const { data, error } = await db.from('submittal_packages').insert({
        ...draft,
        tenant_id: tenantId,
        created_by: user.id,
        updated_by: user.id,
      }).select('*').single();
      if (error) throw error;
      return data as SubmittalPackage;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const updateApproval = useMutation({
    mutationFn: async ({ id, approval_status }: { id: string; approval_status: ApprovalStatus }) => {
      if (!user || !tenantId) throw new Error('A signed-in tenant account is required.');
      const { error } = await db.from('submittal_packages').update({
        approval_status, updated_by: user.id, updated_at: new Date().toISOString(),
      }).eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      await db.from('submittal_approval_events').insert({
        tenant_id: tenantId, package_id: id, status: approval_status, recorded_by: user.id,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { packages: packages.data ?? [], isLoading: packages.isLoading, save, updateApproval };
}
