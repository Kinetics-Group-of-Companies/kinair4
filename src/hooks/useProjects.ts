import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from '@/hooks/use-toast';

export interface Project {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  project_reference: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'completed';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectItem {
  id: string;
  project_id: string;
  tenant_id: string;
  series_name: string;
  diameter: number;
  blade_count: number;
  blade_angle: number;
  motor_poles: number;
  required_airflow: number;
  required_pressure: number;
  operating_airflow: number | null;
  operating_pressure: number | null;
  shaft_power: number | null;
  efficiency: number | null;
  motor_rating_kw: number | null;
  motor_frame: string | null;
  altitude: number | null;
  temperature: number | null;
  air_density: number | null;
  frequency: number | null;
  quantity: number;
  unit_price: number | null;
  notes: string | null;
  nomenclature: string | null;
  datasheet_url: string | null;
  airflow_unit: string | null;
  pressure_unit: string | null;
  // New fields for complete datasheet parity
  noise_distance: number | null;
  noise_directivity_q: number | null;
  sound_outlet_reduction: number | null;
  stall_min_percent: number | null;
  stall_max_percent: number | null;
  vfd_enabled: boolean | null;
  vfd_frequency: number | null;
  voltage_drive_enabled: boolean | null;
  drive_voltage: number | null;
  nominal_voltage: number | null;
  motor_brand_name: string | null;
  motor_rated_current: number | null;
  motor_full_load_current: number | null;
  motor_starting_current: number | null;
  motor_voltage: number | null;
  motor_ip_rating: string | null;
  motor_insulation_class: string | null;
  motor_efficiency_class: string | null;
  motor_weight: number | null;
  motor_fire_rating: string | null;
  motor_phase: number | null;
  casing_weight: number | null;
  impeller_weight: number | null;
  total_weight: number | null;
  fan_rpm: number | null;
  outlet_velocity: number | null;
  dynamic_pressure: number | null;
  total_pressure: number | null;
  fire_class: string | null;
  atex_rating: string | null;
  selected_accessories: string[] | null;
  flexible_dimension_values: Record<string, any> | null;
  series_id: string | null;
  fan_model_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  project_reference?: string;
  notes?: string;
}

export interface CreateProjectItemData {
  project_id: string;
  series_name: string;
  diameter: number;
  blade_count: number;
  blade_angle: number;
  motor_poles: number;
  required_airflow: number;
  required_pressure: number;
  operating_airflow?: number;
  operating_pressure?: number;
  shaft_power?: number;
  efficiency?: number;
  motor_rating_kw?: number;
  motor_frame?: string;
  altitude?: number;
  temperature?: number;
  air_density?: number;
  frequency?: number;
  quantity?: number;
  unit_price?: number;
  notes?: string;
  nomenclature?: string;
  datasheet_url?: string;
  airflow_unit?: string;
  pressure_unit?: string;
  // New fields for complete datasheet parity
  noise_distance?: number;
  noise_directivity_q?: number;
  sound_outlet_reduction?: number;
  stall_min_percent?: number;
  stall_max_percent?: number;
  vfd_enabled?: boolean;
  vfd_frequency?: number;
  voltage_drive_enabled?: boolean;
  drive_voltage?: number;
  nominal_voltage?: number;
  motor_brand_name?: string;
  motor_rated_current?: number;
  motor_full_load_current?: number;
  motor_starting_current?: number;
  motor_voltage?: number;
  motor_ip_rating?: string;
  motor_insulation_class?: string;
  motor_efficiency_class?: string;
  motor_weight?: number;
  motor_fire_rating?: string;
  motor_phase?: number;
  casing_weight?: number;
  impeller_weight?: number;
  total_weight?: number;
  fan_rpm?: number;
  outlet_velocity?: number;
  dynamic_pressure?: number;
  total_pressure?: number;
  fire_class?: string;
  atex_rating?: string;
  selected_accessories?: string[];
  flexible_dimension_values?: Record<string, any>;
  series_id?: string;
  fan_model_id?: string;
}

export function useProjects() {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ['projects', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as Project[];
    },
    enabled: !!user && !!tenantId,
  });

  const createProject = useMutation({
    mutationFn: async (projectData: CreateProjectData) => {
      if (!user || !tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...projectData,
          tenant_id: tenantId,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to create project', description: error.message, variant: 'destructive' });
    },
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update project', description: error.message, variant: 'destructive' });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete project', description: error.message, variant: 'destructive' });
    },
  });

  return {
    projects: projectsQuery.data ?? [],
    isLoading: projectsQuery.isLoading,
    createProject,
    updateProject,
    deleteProject,
  };
}

export function useProjectItems(projectId: string | null) {
  const { user, tenantId } = useAuth();
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: ['project-items', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ProjectItem[];
    },
    enabled: !!user && !!projectId,
  });

  const addItem = useMutation({
    mutationFn: async (itemData: CreateProjectItemData) => {
      if (!tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('project_items')
        .insert({
          ...itemData,
          tenant_id: tenantId,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ProjectItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      toast({ title: 'Fan added to project' });
    },
    onError: (error) => {
      toast({ title: 'Failed to add fan', description: error.message, variant: 'destructive' });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProjectItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('project_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProjectItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
    },
    onError: (error) => {
      toast({ title: 'Failed to update item', description: error.message, variant: 'destructive' });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('project_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      toast({ title: 'Item removed from project' });
    },
    onError: (error) => {
      toast({ title: 'Failed to remove item', description: error.message, variant: 'destructive' });
    },
  });

  return {
    items: itemsQuery.data ?? [],
    isLoading: itemsQuery.isLoading,
    addItem,
    updateItem,
    deleteItem,
  };
}
