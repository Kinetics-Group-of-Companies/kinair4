import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from 'sonner';

// Types for flexible dimensions
export interface DimensionParam {
  id: string;
  param_key: string;
  param_label: string;
  param_type: 'number' | 'text';
  display_order: number;
}

export interface DimensionValue {
  id: string;
  size: number;
  values: Record<string, string | number>;
  is_from_model: boolean;
}

// Query keys
export const flexDimensionKeys = {
  schema: (seriesId: string) => ['flexDimensions', 'schema', seriesId] as const,
  values: (seriesId: string) => ['flexDimensions', 'values', seriesId] as const,
};

// ============ DIMENSION SCHEMA HOOKS ============
export function useDimensionSchema(seriesId: string | null) {
  return useQuery({
    queryKey: flexDimensionKeys.schema(seriesId || ''),
    queryFn: async () => {
      if (!seriesId) return [];
      const { data, error } = await supabase
        .from('series_dimension_schema')
        .select('*')
        .eq('series_id', seriesId)
        .order('display_order');
      if (error) throw error;
      return data.map(d => ({
        id: d.id,
        param_key: d.param_key,
        param_label: d.param_label,
        param_type: d.param_type as 'number' | 'text',
        display_order: d.display_order,
      })) as DimensionParam[];
    },
    enabled: !!seriesId,
  });
}

export function useAddDimensionParam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      seriesId, 
      param_key, 
      param_label, 
      param_type = 'text',
      display_order 
    }: { 
      seriesId: string; 
      param_key: string; 
      param_label: string; 
      param_type?: 'number' | 'text';
      display_order: number;
    }) => {
      const { data, error } = await supabase
        .from('series_dimension_schema')
        .insert({
          series_id: seriesId,
          param_key,
          param_label,
          param_type,
          display_order,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: flexDimensionKeys.schema(seriesId) });
      toast.success('Parameter added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateDimensionParam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      seriesId,
      updates 
    }: { 
      id: string; 
      seriesId: string;
      updates: Partial<{ param_label: string; param_type: string; display_order: number }>;
    }) => {
      const { error } = await supabase
        .from('series_dimension_schema')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: flexDimensionKeys.schema(seriesId) });
      toast.success('Parameter updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDimensionParam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, seriesId }: { id: string; seriesId: string }) => {
      const { error } = await supabase
        .from('series_dimension_schema')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: flexDimensionKeys.schema(seriesId) });
      toast.success('Parameter deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ DIMENSION VALUES HOOKS ============
export function useDimensionValues(seriesId: string | null) {
  return useQuery({
    queryKey: flexDimensionKeys.values(seriesId || ''),
    queryFn: async () => {
      if (!seriesId) return [];
      const { data, error } = await supabase
        .from('series_dimension_values')
        .select('*')
        .eq('series_id', seriesId)
        .order('size');
      if (error) throw error;
      return data.map(d => ({
        id: d.id,
        size: d.size,
        values: (d.values as Record<string, string | number>) || {},
        is_from_model: d.is_from_model || false,
      })) as DimensionValue[];
    },
    enabled: !!seriesId,
  });
}

export function useUpsertDimensionValue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      seriesId, 
      size, 
      values,
      is_from_model = false
    }: { 
      seriesId: string; 
      size: number; 
      values: Record<string, string | number>;
      is_from_model?: boolean;
    }) => {
      const { error } = await supabase
        .from('series_dimension_values')
        .upsert({
          series_id: seriesId,
          size,
          values,
          is_from_model,
        }, { 
          onConflict: 'series_id,size',
          ignoreDuplicates: false 
        });
      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: flexDimensionKeys.values(seriesId) });
      toast.success('Dimension saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDimensionValue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ seriesId, size }: { seriesId: string; size: number }) => {
      const { error } = await supabase
        .from('series_dimension_values')
        .delete()
        .eq('series_id', seriesId)
        .eq('size', size);
      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: flexDimensionKeys.values(seriesId) });
      toast.success('Size deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// Sync sizes from fan_models for a series
export function useSyncSizesFromModels() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ seriesId }: { seriesId: string }) => {
      // Get all fan models for this series
      const { data: models, error: modelsError } = await supabase
        .from('fan_models')
        .select('diameter')
        .eq('series_id', seriesId)
        .order('diameter');
      
      if (modelsError) throw modelsError;
      
      // Get existing dimension values
      const { data: existing, error: existingError } = await supabase
        .from('series_dimension_values')
        .select('size')
        .eq('series_id', seriesId);
      
      if (existingError) throw existingError;
      
      const existingSizes = new Set(existing?.map(e => e.size) || []);
      const modelSizes = [...new Set(models?.map(m => m.diameter) || [])];
      
      // Add missing sizes from models
      let addedCount = 0;
      for (const size of modelSizes) {
        if (!existingSizes.has(size)) {
          const { error } = await supabase
            .from('series_dimension_values')
            .insert({
              series_id: seriesId,
              size,
              values: {},
              is_from_model: true,
            });
          if (!error) addedCount++;
        }
      }
      
      return { addedCount, totalModels: modelSizes.length };
    },
    onSuccess: (result, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: flexDimensionKeys.values(seriesId) });
      if (result.addedCount > 0) {
        toast.success(`Added ${result.addedCount} sizes from models`);
      } else {
        toast.info('All model sizes already exist');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// Initialize with default KTAF-style parameters
export function useInitializeDefaultSchema() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ seriesId }: { seriesId: string }) => {
      const defaultParams = [
        { param_key: 'phi_d2', param_label: 'ΦD2', param_type: 'text', display_order: 0 },
        { param_key: 'phi_d1', param_label: 'ΦD1', param_type: 'text', display_order: 1 },
        { param_key: 'phi_d', param_label: 'ΦD', param_type: 'text', display_order: 2 },
        { param_key: 'h', param_label: 'H', param_type: 'text', display_order: 3 },
        { param_key: 'e', param_label: 'E', param_type: 'text', display_order: 4 },
        { param_key: 'f', param_label: 'F', param_type: 'text', display_order: 5 },
        { param_key: 'l', param_label: 'L', param_type: 'text', display_order: 6 },
        { param_key: 'k', param_label: 'K', param_type: 'text', display_order: 7 },
        { param_key: 'n_phi_d', param_label: 'n-Φd', param_type: 'text', display_order: 8 },
        { param_key: 'z_phi_d1', param_label: 'z-Φd1', param_type: 'text', display_order: 9 },
        { param_key: 'motor_max', param_label: 'Motor Max', param_type: 'text', display_order: 10 },
      ];
      
      for (const param of defaultParams) {
        await supabase
          .from('series_dimension_schema')
          .upsert({
            series_id: seriesId,
            ...param,
          }, { onConflict: 'series_id,param_key' });
      }
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: flexDimensionKeys.schema(seriesId) });
      toast.success('Default parameters initialized');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
