import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from '@/hooks/use-toast';
import type { LpoDocument } from '@/lib/lpoTracker';

const BUCKET = 'lpo-documents';

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
}

/** Files attached to an LPO — client LPO, supplier PO, quotation and supporting documents. */
export function useLpoDocuments(orderId: string | null) {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['lpo-documents', orderId],
    queryFn: async () => {
      if (!orderId) return [] as LpoDocument[];
      const { data, error } = await supabase
        .from('lpo_documents')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LpoDocument[];
    },
    enabled: !!user && !!orderId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lpo-documents', orderId] });

  const uploadDocument = useMutation({
    mutationFn: async ({ file, docType, title }: { file: File; docType: string; title?: string }) => {
      if (!orderId || !tenantId) throw new Error('Not authenticated');
      const path = `${tenantId}/${orderId}/${Date.now()}-${safeName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('lpo_documents').insert({
        order_id: orderId,
        tenant_id: tenantId,
        user_id: user?.id ?? null,
        uploaded_by_name: user?.email ?? null,
        doc_type: docType,
        title: title?.trim() || null,
        file_name: file.name,
        storage_path: path,
        file_size_bytes: file.size,
        mime_type: file.type || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Document uploaded' });
    },
    onError: (error: Error) =>
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }),
  });

  const deleteDocument = useMutation({
    mutationFn: async (doc: LpoDocument) => {
      await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      const { error } = await supabase.from('lpo_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Document removed' });
    },
    onError: (error: Error) =>
      toast({ title: 'Failed to remove document', description: error.message, variant: 'destructive' }),
  });

  const openDocument = async (doc: LpoDocument) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: 'Could not open file', description: error?.message, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return {
    documents: documentsQuery.data ?? [],
    isLoading: documentsQuery.isLoading,
    uploadDocument,
    deleteDocument,
    openDocument,
  };
}
