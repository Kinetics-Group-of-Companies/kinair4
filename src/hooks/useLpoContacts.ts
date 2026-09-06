import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from '@/hooks/use-toast';
import type { LpoContact } from '@/lib/lpoTracker';

export type ContactInput = {
  contact_type: 'customer' | 'supplier';
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  trn?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
};

/** Saved customer / supplier address book, searchable and reusable across orders. */
export function useLpoContacts() {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();

  const contactsQuery = useQuery({
    queryKey: ['lpo-contacts', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lpo_contacts')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LpoContact[];
    },
    enabled: !!user && !!tenantId,
  });

  const contacts = contactsQuery.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lpo-contacts'] });

  const saveContact = useMutation({
    mutationFn: async (input: ContactInput) => {
      if (!tenantId) throw new Error('Not authenticated');
      const name = input.name.trim();
      if (!name) return null;
      const existing = contacts.find(
        (c) => c.contact_type === input.contact_type && c.name.toLowerCase() === name.toLowerCase(),
      );
      const row = {
        tenant_id: tenantId,
        contact_type: input.contact_type,
        name,
        contact_person: input.contact_person || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        trn: input.trn || null,
        payment_terms: input.payment_terms || null,
        notes: input.notes || null,
        created_by: user?.id ?? null,
      };
      if (existing) {
        // Only fill in blanks — never wipe details already on file.
        const patch: Record<string, unknown> = {};
        (['contact_person', 'email', 'phone', 'address', 'trn', 'payment_terms', 'notes'] as const).forEach((k) => {
          if (!existing[k] && row[k]) patch[k] = row[k];
        });
        if (Object.keys(patch).length === 0) return existing;
        const { data, error } = await supabase
          .from('lpo_contacts')
          .update(patch as never)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as LpoContact;
      }
      const { data, error } = await supabase
        .from('lpo_contacts')
        .insert(row as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LpoContact;
    },
    onSuccess: () => invalidate(),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lpo_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contact removed' });
    },
    onError: (error: Error) =>
      toast({ title: 'Failed to remove contact', description: error.message, variant: 'destructive' }),
  });

  return {
    contacts,
    customers: contacts.filter((c) => c.contact_type === 'customer'),
    suppliers: contacts.filter((c) => c.contact_type === 'supplier'),
    isLoading: contactsQuery.isLoading,
    saveContact,
    deleteContact,
  };
}
