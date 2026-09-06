import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from 'sonner';

// Default tenant ID for public branding
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

interface PageSection {
  section_key: string;
  title: string;
  content: string;
  is_visible: boolean;
  display_order: number;
}

interface PageContentRow {
  id: string;
  tenant_id: string;
  page_key: string;
  section_key: string;
  title: string | null;
  content: string | null;
  is_visible: boolean | null;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

export function usePageContent(pageKey: 'about' | 'quote' | 'home') {
  // Always use default tenant for shared page content - all users see the same About/Quote pages
  return useQuery({
    queryKey: ['pageContent', DEFAULT_TENANT_ID, pageKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_content')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('page_key', pageKey)
        .order('display_order');
      
      if (error) throw error;
      
      return (data as PageContentRow[]).map(row => ({
        section_key: row.section_key,
        title: row.title || '',
        content: row.content || '',
        is_visible: row.is_visible ?? true,
        display_order: row.display_order ?? 0,
      })) as PageSection[];
    },
    enabled: true,
    staleTime: 1000 * 60 * 10, // Page content rarely changes - avoid refetch flicker
    placeholderData: (prev) => prev,
  });
}

export function useUpsertPageContent() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async ({ pageKey, sections }: { pageKey: string; sections: PageSection[] }) => {
      if (!tenantId) throw new Error('No tenant');

      // Upsert each section
      for (const section of sections) {
        const { error } = await supabase
          .from('page_content')
          .upsert({
            tenant_id: DEFAULT_TENANT_ID, // Always save to default tenant for shared content
            page_key: pageKey,
            section_key: section.section_key,
            title: section.title,
            content: section.content,
            is_visible: section.is_visible,
            display_order: section.display_order,
          }, {
            onConflict: 'tenant_id,page_key,section_key',
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, { pageKey }) => {
      queryClient.invalidateQueries({ queryKey: ['pageContent', tenantId, pageKey] });
      // Also invalidate for public access
      queryClient.invalidateQueries({ queryKey: ['pageContent', DEFAULT_TENANT_ID, pageKey] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePageSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageKey, sectionKey }: { pageKey: string; sectionKey: string }) => {
      const { error } = await supabase
        .from('page_content')
        .delete()
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('page_key', pageKey)
        .eq('section_key', sectionKey);
      
      if (error) throw error;
    },
    onSuccess: (_, { pageKey }) => {
      queryClient.invalidateQueries({ queryKey: ['pageContent', DEFAULT_TENANT_ID, pageKey] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}