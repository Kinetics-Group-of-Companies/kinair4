import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from '@/hooks/use-toast';
import type { LpoOrder, LpoOrderUpdate } from '@/lib/lpoTracker';

export type LpoOrderInput = Partial<Omit<LpoOrder, 'id' | 'tenant_id' | 'user_id' | 'created_at' | 'updated_at'>> & {
  lpo_ref: string;
  client_name: string;
};

export function useLpoOrders() {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ['lpo-orders', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lpo_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LpoOrder[];
    },
    enabled: !!user && !!tenantId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lpo-orders'] });

  const createOrder = useMutation({
    mutationFn: async (input: LpoOrderInput) => {
      if (!user || !tenantId) throw new Error('Not authenticated');
      const editorName =
        (user.user_metadata?.display_name as string | undefined) || user.email || 'Unknown user';
      const { data, error } = await supabase
        .from('lpo_orders')
        .insert({
          ...input,
          notify_email: input.notify_email || user.email,
          tenant_id: tenantId,
          user_id: user.id,
          last_updated_by_name: editorName,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LpoOrder;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Order added to the tracker' });
    },
    onError: (error: Error) =>
      toast({ title: 'Failed to add order', description: error.message, variant: 'destructive' }),
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LpoOrder> & { id: string }) => {
      const editorName =
        (user?.user_metadata?.display_name as string | undefined) || user?.email || 'Unknown user';
      const { data, error } = await supabase
        .from('lpo_orders')
        .update({ ...updates, last_updated_by_name: editorName } as never)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LpoOrder;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Order updated' });
    },
    onError: (error: Error) =>
      toast({ title: 'Failed to update order', description: error.message, variant: 'destructive' }),
  });

  // Silent server-side draft save used while the Punch New Order form is being
  // filled in — no toasts, so typing is never interrupted.
  const upsertDraft = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: Record<string, unknown> }) => {
      if (!user || !tenantId) throw new Error('Not authenticated');
      const editorName =
        (user.user_metadata?.display_name as string | undefined) || user.email || 'Unknown user';
      if (id) {
        const { data, error } = await supabase
          .from('lpo_orders')
          .update({ ...payload, is_draft: true, last_updated_by_name: editorName } as never)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as LpoOrder;
      }
      const { data, error } = await supabase
        .from('lpo_orders')
        .insert({
          ...payload,
          is_draft: true,
          notify_email: user.email,
          tenant_id: tenantId,
          user_id: user.id,
          last_updated_by_name: editorName,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LpoOrder;
    },
    onSuccess: () => invalidate(),
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lpo_orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Order removed' });
    },
    onError: (error: Error) =>
      toast({ title: 'Failed to remove order', description: error.message, variant: 'destructive' }),
  });

  return {
    orders: ordersQuery.data ?? [],
    isLoading: ordersQuery.isLoading,
    createOrder,
    updateOrder,
    upsertDraft,
    deleteOrder,
  };
}

export function useLpoOrderUpdates(orderId: string | null) {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();

  const updatesQuery = useQuery({
    queryKey: ['lpo-order-updates', orderId],
    queryFn: async () => {
      if (!orderId) return [] as LpoOrderUpdate[];
      const { data, error } = await supabase
        .from('lpo_order_updates')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LpoOrderUpdate[];
    },
    enabled: !!user && !!orderId,
  });

  const addUpdate = useMutation({
    mutationFn: async ({ note, status }: { note: string; status?: string }) => {
      if (!orderId || !tenantId) throw new Error('Not authenticated');
      const { error } = await supabase.from('lpo_order_updates').insert({
        order_id: orderId,
        tenant_id: tenantId,
        user_id: user?.id ?? null,
        author_name: user?.email ?? null,
        note,
        status_at_time: status ?? null,
      } as never);
      if (error) throw error;

      await supabase
        .from('lpo_orders')
        .update({ last_followup_date: new Date().toISOString().slice(0, 10) } as never)
        .eq('id', orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpo-order-updates', orderId] });
      queryClient.invalidateQueries({ queryKey: ['lpo-orders'] });
      toast({ title: 'Follow-up logged' });
    },
    onError: (error: Error) =>
      toast({ title: 'Failed to log follow-up', description: error.message, variant: 'destructive' }),
  });

  return { updates: updatesQuery.data ?? [], isLoading: updatesQuery.isLoading, addUpdate };
}
