import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from '@/hooks/use-toast';
import {
  promisedDeliveryDate,
  baselineCommittedDate,
  type LpoOrder,
  type LpoRevision,
} from '@/lib/lpoTracker';

export interface NewRevisionInput {
  revised_lpo_ref?: string | null;
  revised_lpo_date?: string | null;
  revised_lpo_received_date?: string | null;
  revised_order_value?: number | null;
  revised_lead_time_weeks_min?: number | null;
  revised_lead_time_weeks_max?: number | null;
  revised_committed_date?: string | null;
  reason?: string | null;
}

export function useLpoRevisions(order: LpoOrder | null) {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();
  const orderId = order?.id ?? null;

  const revisionsQuery = useQuery({
    queryKey: ['lpo-revisions', orderId],
    queryFn: async () => {
      if (!orderId) return [] as LpoRevision[];
      const { data, error } = await supabase
        .from('lpo_revisions')
        .select('*')
        .eq('order_id', orderId)
        .order('revision_no', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LpoRevision[];
    },
    enabled: !!user && !!orderId,
  });

  const addRevision = useMutation({
    mutationFn: async (input: NewRevisionInput) => {
      if (!order || !tenantId) throw new Error('Not authenticated');
      const previousCommitted = promisedDeliveryDate(order);
      const revisionNo = (revisionsQuery.data?.[0]?.revision_no ?? 0) + 1;

      // Keep the original commitment as the baseline so total slippage stays visible.
      const baseline = order.baseline_committed_date ?? baselineCommittedDate(order);

      const merged: Partial<LpoOrder> = {
        ...order,
        revised_lpo_ref: input.revised_lpo_ref ?? order.revised_lpo_ref,
        revised_lpo_date: input.revised_lpo_date ?? order.revised_lpo_date,
        revised_lpo_received_date: input.revised_lpo_received_date ?? order.revised_lpo_received_date,
        revised_order_value: input.revised_order_value ?? order.revised_order_value,
        revised_lead_time_weeks_min: input.revised_lead_time_weeks_min ?? order.revised_lead_time_weeks_min,
        revised_lead_time_weeks_max: input.revised_lead_time_weeks_max ?? order.revised_lead_time_weeks_max,
        committed_delivery_date: input.revised_committed_date ?? null,
      };
      const newCommitted = promisedDeliveryDate(merged);

      const { error: revError } = await supabase.from('lpo_revisions').insert({
        order_id: order.id,
        tenant_id: tenantId,
        user_id: user?.id ?? null,
        author_name: user?.email ?? null,
        revision_no: revisionNo,
        revised_lpo_ref: input.revised_lpo_ref ?? null,
        revised_lpo_date: input.revised_lpo_date ?? null,
        revised_lpo_received_date: input.revised_lpo_received_date ?? null,
        revised_order_value: input.revised_order_value ?? null,
        revised_lead_time_weeks_min: input.revised_lead_time_weeks_min ?? null,
        revised_lead_time_weeks_max: input.revised_lead_time_weeks_max ?? null,
        revised_committed_date: newCommitted,
        previous_committed_date: previousCommitted,
        reason: input.reason ?? null,
      } as never);
      if (revError) throw revError;

      const { error: orderError } = await supabase
        .from('lpo_orders')
        .update({
          baseline_committed_date: baseline,
          revised_lpo_ref: merged.revised_lpo_ref ?? null,
          revised_lpo_date: merged.revised_lpo_date ?? null,
          revised_lpo_received_date: merged.revised_lpo_received_date ?? null,
          revised_order_value: merged.revised_order_value ?? null,
          revised_lead_time_weeks_min: merged.revised_lead_time_weeks_min ?? null,
          revised_lead_time_weeks_max: merged.revised_lead_time_weeks_max ?? null,
          committed_delivery_date: input.revised_committed_date ?? order.committed_delivery_date ?? null,
          revision_notes: input.reason ?? order.revision_notes ?? null,
        } as never)
        .eq('id', order.id);
      if (orderError) throw orderError;

      await supabase.from('lpo_order_updates').insert({
        order_id: order.id,
        tenant_id: tenantId,
        user_id: user?.id ?? null,
        author_name: user?.email ?? null,
        note: `Revision ${revisionNo} recorded. Committed delivery moved from ${previousCommitted ?? '—'} to ${newCommitted ?? '—'}.${input.reason ? ` Reason: ${input.reason}` : ''}`,
        status_at_time: order.status,
      } as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpo-revisions', orderId] });
      queryClient.invalidateQueries({ queryKey: ['lpo-orders'] });
      queryClient.invalidateQueries({ queryKey: ['lpo-order-updates', orderId] });
      toast({ title: 'Revision recorded', description: 'Committed delivery recalculated.' });
    },
    onError: (error: Error) =>
      toast({ title: 'Failed to record revision', description: error.message, variant: 'destructive' }),
  });

  return { revisions: revisionsQuery.data ?? [], isLoading: revisionsQuery.isLoading, addRevision };
}
