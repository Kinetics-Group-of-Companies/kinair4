import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from 'sonner';
import type { 
  FanModel, 
  BladeConfiguration, 
  SeriesInfo, 
  FanDimension,
  UnitPreferences,
  MotorBrand,
  MotorSpecification,
  CasingWeight,
  ImpellerWeight,
  ContactInfo,
  FanPerformancePoint,
  OctaveBandData
} from '@/lib/fanData';

// Query keys
export const fanDatabaseKeys = {
  all: ['fanDatabase'] as const,
  tenant: (tenantId: string) => [...fanDatabaseKeys.all, 'tenant', tenantId] as const,
  series: (tenantId: string) => [...fanDatabaseKeys.tenant(tenantId), 'series'] as const,
  fanModels: (tenantId: string) => [...fanDatabaseKeys.tenant(tenantId), 'fanModels'] as const,
  bladeConfigs: (fanModelId: string) => [...fanDatabaseKeys.all, 'bladeConfigs', fanModelId] as const,
  performanceData: (bladeConfigId: string) => [...fanDatabaseKeys.all, 'performance', bladeConfigId] as const,
  noiseData: (bladeConfigId: string) => [...fanDatabaseKeys.all, 'noise', bladeConfigId] as const,
  dimensions: (seriesId: string) => [...fanDatabaseKeys.all, 'dimensions', seriesId] as const,
  motorBrands: (tenantId: string) => [...fanDatabaseKeys.tenant(tenantId), 'motorBrands'] as const,
  motorSpecs: (tenantId: string) => [...fanDatabaseKeys.tenant(tenantId), 'motorSpecs'] as const,
  unitPrefs: (tenantId: string) => [...fanDatabaseKeys.tenant(tenantId), 'unitPrefs'] as const,
  casingWeights: (tenantId: string, seriesId?: string) => [...fanDatabaseKeys.tenant(tenantId), 'casingWeights', seriesId || 'all'] as const,
  impellerWeights: (tenantId: string, seriesId?: string) => [...fanDatabaseKeys.tenant(tenantId), 'impellerWeights', seriesId || 'all'] as const,
};

// Default tenant ID for public branding (first/main tenant)
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const invalidateSharedMotorSpecs = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.motorSpecs(DEFAULT_TENANT_ID) });

// ============ TENANT DATA HOOK ============
// This hook fetches tenant data for branding purposes
// It ALWAYS uses the default tenant for consistent branding across all users
const BRANDING_CACHE_KEY = 'kinair_branding';

function readCachedBranding() {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function useTenantData() {
  return useQuery({
    queryKey: ['tenant', DEFAULT_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', DEFAULT_TENANT_ID)
        .maybeSingle();
      if (error) throw error;
      // Persist branding so the logo/name render instantly on next refresh
      try {
        if (data) localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(data));
      } catch { /* storage full / private mode — ignore */ }
      return data;
    },
    enabled: true, // Always enabled - fetch public branding for everyone
    staleTime: 1000 * 60 * 60, // Branding rarely changes - keep it cached
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false, // Avoid logo re-loading flicker on mobile
    refetchOnMount: false,
    placeholderData: (prev: unknown) => prev as never,
    // Seed from localStorage so the logo and company name never flash empty on refresh
    initialData: readCachedBranding,
    initialDataUpdatedAt: 0,
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  return useMutation({
    mutationFn: async (updates: { name?: string; logo_url?: string; email?: string; phone?: string; address?: string; favicon_url?: string; google_maps_url?: string }) => {
      if (!isAdmin) throw new Error('Admin access required');

      const tryUpdate = async (tenantId: string) => {
        const { data, error } = await supabase
          .from('tenants')
          .update(updates)
          .eq('id', tenantId)
          .select('*');
        if (error) throw error;
        return data && data.length > 0 ? data[0] : null;
      };

      let row = await tryUpdate(DEFAULT_TENANT_ID);

      if (!row) {
        // Not an admin of the main profile — update the tenant this account belongs to
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('user_id', userId)
            .maybeSingle();
          const ownTenantId = (profile as any)?.tenant_id;
          if (ownTenantId && ownTenantId !== DEFAULT_TENANT_ID) {
            row = await tryUpdate(ownTenantId);
          }
        }
      }

      if (!row) {
        throw new Error(
          'Update blocked: your account is not an admin of the company profile, so no changes were saved.'
        );
      }
      return row;
    },

    onSuccess: (row) => {
      if (row && (row as any).id === DEFAULT_TENANT_ID) {
        queryClient.setQueryData(['tenant', DEFAULT_TENANT_ID], row);
      }
      queryClient.invalidateQueries({ queryKey: ['tenant', DEFAULT_TENANT_ID] });
      queryClient.refetchQueries({ queryKey: ['tenant', DEFAULT_TENANT_ID] });
      toast.success('Company info updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}


// ============ FAN SERIES HOOKS ============
export function useFanSeries() {
  // Always fetch from default tenant for fan selection - all users see the same catalog
  return useQuery({
    queryKey: fanDatabaseKeys.series(DEFAULT_TENANT_ID),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fan_series')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('name');
      if (error) throw error;
      return data.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        imageUrl: s.image_url || undefined,
        drawingUrl: s.drawing_url || undefined,
        datasheetDescription: (s as any).datasheet_description || undefined,
        showOctaveBands: (s as any).show_octave_bands ?? true,
        amcaCertified: (s as any).amca_certified ?? false,
        fireRating: (s as any).fire_rating || undefined,
        amcaLogoUrl: (s as any).amca_logo_url || undefined,
        fireRatingLogoUrl: (s as any).fire_rating_logo_url || undefined,
        catalogueUrl: (s as any).catalogue_url || undefined,
        iomUrl: (s as any).iom_url || undefined,
        fanType: (s as any).fan_type || 'axial',
        nomenclatureTemplate: (s as any).nomenclature_template || '{series}-{size}',
        ceCertified: (s as any).ce_certified ?? false,
        ceLogoUrl: (s as any).ce_logo_url || undefined,
        isoCertified: (s as any).iso_certified ?? false,
        isoLogoUrl: (s as any).iso_logo_url || undefined,
        ulCertified: (s as any).ul_certified ?? false,
        ulLogoUrl: (s as any).ul_logo_url || undefined,
        atexCertified: (s as any).atex_certified ?? false,
        atexLogoUrl: (s as any).atex_logo_url || undefined,
        customCertName: (s as any).custom_cert_name || undefined,
        customCertLogoUrl: (s as any).custom_cert_logo_url || undefined,
        defaultSafetyFactor: (s as any).default_safety_factor ?? 1.15,
        // New fields for datasheet features
        soundOutletReduction: (s as any).sound_outlet_reduction ?? 0,
        stallAirflowMinPercent: (s as any).stall_airflow_min_percent ?? 15,
        stallAirflowMaxPercent: (s as any).stall_airflow_max_percent ?? 95,
        compatibleAccessories: (s as any).compatible_accessories || [],
        // Default noise settings
        defaultDirectivityQ: (s as any).default_directivity_q ?? 2,
        defaultNoiseDistance: (s as any).default_noise_distance ?? 0,
      })) as (SeriesInfo & { drawingUrl?: string; datasheetDescription?: string; showOctaveBands?: boolean; amcaCertified?: boolean; fireRating?: string; amcaLogoUrl?: string; fireRatingLogoUrl?: string; catalogueUrl?: string; iomUrl?: string; fanType?: string; nomenclatureTemplate?: string; ceCertified?: boolean; ceLogoUrl?: string; isoCertified?: boolean; isoLogoUrl?: string; ulCertified?: boolean; ulLogoUrl?: string; atexCertified?: boolean; atexLogoUrl?: string; customCertName?: string; customCertLogoUrl?: string; defaultSafetyFactor?: number; soundOutletReduction?: number; stallAirflowMinPercent?: number; stallAirflowMaxPercent?: number; compatibleAccessories?: string[]; defaultDirectivityQ?: number; defaultNoiseDistance?: number })[];
    },
    enabled: true, // Always enabled for public access
  });
}

export function useAddSeries() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (series: { name: string; description?: string; image_url?: string }) => {
      if (!tenantId) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('fan_series')
        .insert({ ...series, tenant_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.series(tenantId || '') });
      toast.success('Series added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateSeries() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { name?: string; description?: string; image_url?: string; drawing_url?: string; datasheet_description?: string; show_octave_bands?: boolean; amca_certified?: boolean; fire_rating?: string; amca_logo_url?: string; fire_rating_logo_url?: string; catalogue_url?: string; iom_url?: string; fan_type?: string; nomenclature_template?: string; ce_certified?: boolean; ce_logo_url?: string; iso_certified?: boolean; iso_logo_url?: string; ul_certified?: boolean; ul_logo_url?: string; atex_certified?: boolean; atex_logo_url?: string; custom_cert_name?: string; custom_cert_logo_url?: string; default_safety_factor?: number; sound_outlet_reduction?: number; stall_airflow_min_percent?: number; stall_airflow_max_percent?: number; compatible_accessories?: string[]; default_directivity_q?: number; default_noise_distance?: number } }) => {
      const { error } = await supabase
        .from('fan_series')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.series(tenantId || '') });
      toast.success('Series updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteSeries() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fan_series')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.series(tenantId || '') });
      toast.success('Series deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ FAN MODELS HOOKS ============
export function useFanModels() {
  // Always fetch from default tenant for fan selection - all users see the same catalog
  return useQuery({
    queryKey: fanDatabaseKeys.fanModels(DEFAULT_TENANT_ID),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fan_models')
        .select(`
          *,
          fan_series!inner(id, name, fan_type),
          blade_configurations(
            id,
            blade_count,
            blade_angles,
            performance_data(*),
            noise_data(*)
          )
        `)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('diameter');
      if (error) throw error;
      
      return data.map(fm => {
        const bladeConfigs: BladeConfiguration[] = (fm.blade_configurations || []).map((bc: any) => {
          const performanceData: { [angle: number]: FanPerformancePoint[] } = {};
          const noiseData: { [angle: number]: OctaveBandData } = {};
          
          // Group performance data by blade_angle
          (bc.performance_data || []).forEach((pd: any) => {
            if (!performanceData[pd.blade_angle]) {
              performanceData[pd.blade_angle] = [];
            }
            performanceData[pd.blade_angle][pd.point_index] = {
              airflow: Number(pd.airflow),
              staticPressure: Number(pd.static_pressure),
              shaftPower: Number(pd.shaft_power),
              efficiency: Number(pd.efficiency),
              totalEfficiency: Number(pd.total_efficiency) || 0,
            };
          });
          
          // Group noise data by blade_angle
          (bc.noise_data || []).forEach((nd: any) => {
            noiseData[nd.blade_angle] = {
              hz63: Number(nd.hz63) || 0,
              hz125: Number(nd.hz125) || 0,
              hz250: Number(nd.hz250) || 0,
              hz500: Number(nd.hz500) || 0,
              hz1k: Number(nd.hz1k) || 0,
              hz2k: Number(nd.hz2k) || 0,
              hz4k: Number(nd.hz4k) || 0,
              hz8k: Number(nd.hz8k) || 0,
              overall: Number(nd.overall) || 0,
            };
          });
          
          return {
            bladeCount: bc.blade_count,
            bladeAngles: bc.blade_angles || [],
            performanceData,
            noiseData,
            id: bc.id,
          };
        });
        
        return {
          id: fm.id,
          diameter: fm.diameter,
          modelName: (fm as any).model_name || undefined,
          productCode: (fm as any).product_code || undefined,
          motorPoles: fm.motor_poles || [2, 4, 6, 8, 12],
          referencePoles: fm.reference_poles || 4, // Base data is stored at this pole count
          bladeConfigurations: bladeConfigs,
          drawingUrl: fm.drawing_url || undefined,
          series: fm.fan_series?.name || '',
          seriesId: fm.series_id,
          fanType: (fm.fan_series as any)?.fan_type || 'axial',
          specifications: {
            weight: fm.weight ? Number(fm.weight) : undefined,
            ipRating: fm.ip_rating || undefined,
            insulationClass: fm.insulation_class || undefined,
          },
        } as FanModel & { seriesId: string; referencePoles: number; productCode?: string };
      });
    },
    enabled: true, // Always enabled for public access
  });
}

export function useAddFanModel() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (fan: { 
      diameter: number; 
      model_name?: string;
      series_id: string; 
      motor_poles?: number[];
      blade_configurations?: { blade_count: number; blade_angles: number[] }[];
    }) => {
      if (!tenantId) throw new Error('No tenant');
      
      // Insert fan model
      const { data: fanModel, error: fanError } = await supabase
        .from('fan_models')
        .insert({ 
          diameter: fan.diameter, 
          model_name: fan.model_name || null,
          series_id: fan.series_id, 
          tenant_id: tenantId,
          motor_poles: fan.motor_poles || [2, 4, 6, 8, 12],
        })
        .select()
        .single();
      if (fanError) throw fanError;
      
      // Track created blade configurations with their IDs
      const createdBladeConfigs: { id: string; bladeCount: number; bladeAngles: number[] }[] = [];
      
      // Insert blade configurations if provided
      if (fan.blade_configurations && fan.blade_configurations.length > 0) {
        for (const bc of fan.blade_configurations) {
          const { data: bladeConfig, error: bcError } = await supabase
            .from('blade_configurations')
            .insert({
              fan_model_id: fanModel.id,
              blade_count: bc.blade_count,
              blade_angles: bc.blade_angles,
            })
            .select()
            .single();
          if (bcError) throw bcError;
          
          createdBladeConfigs.push({
            id: bladeConfig.id,
            bladeCount: bc.blade_count,
            bladeAngles: bc.blade_angles,
          });
          
          // Insert default performance data for each blade angle
          for (const angle of bc.blade_angles) {
            const defaultPoints = Array.from({ length: 12 }, (_, i) => ({
              blade_config_id: bladeConfig.id,
              blade_angle: angle,
              point_index: i,
              airflow: 0,
              static_pressure: 0,
              shaft_power: 0,
              efficiency: 0,
            }));
            
            const { error: perfError } = await supabase
              .from('performance_data')
              .insert(defaultPoints);
            if (perfError) throw perfError;
            
            // Insert default noise data
            const { error: noiseError } = await supabase
              .from('noise_data')
              .insert({
                blade_config_id: bladeConfig.id,
                blade_angle: angle,
                hz63: 0, hz125: 0, hz250: 0, hz500: 0,
                hz1k: 0, hz2k: 0, hz4k: 0, hz8k: 0, overall: 0,
              });
            if (noiseError) throw noiseError;
          }
        }
      }
      
      // Return fan model with blade configurations including IDs
      return {
        ...fanModel,
        bladeConfigurations: createdBladeConfigs,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
      toast.success('Fan model added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateFanModel() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { 
      id: string; 
      updates: { 
        diameter?: number; 
        model_name?: string;
        product_code?: string | null;
        motor_poles?: number[]; 
        drawing_url?: string;
        series_id?: string;
        reference_poles?: number;
      } 
    }) => {
      const { error } = await supabase
        .from('fan_models')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
      toast.success('Fan model updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteFanModel() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete blade configurations first (cascade should handle this but being explicit)
      const { error } = await supabase
        .from('fan_models')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
      toast.success('Fan model deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ BLADE CONFIGURATION HOOKS ============
export function useUpdateBladeConfiguration() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      bladeConfigId, 
      updates 
    }: { 
      bladeConfigId: string; 
      updates: { blade_count?: number; blade_angles?: number[] } 
    }) => {
      const { error } = await supabase
        .from('blade_configurations')
        .update(updates)
        .eq('id', bladeConfigId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddBladeConfiguration() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      fanModelId, 
      bladeCount, 
      bladeAngles 
    }: { 
      fanModelId: string; 
      bladeCount: number; 
      bladeAngles: number[] 
    }) => {
      const { data: bladeConfig, error: bcError } = await supabase
        .from('blade_configurations')
        .insert({
          fan_model_id: fanModelId,
          blade_count: bladeCount,
          blade_angles: bladeAngles,
        })
        .select()
        .single();
      if (bcError) throw bcError;
      
      // Insert default performance and noise data
      for (const angle of bladeAngles) {
        const defaultPoints = Array.from({ length: 12 }, (_, i) => ({
          blade_config_id: bladeConfig.id,
          blade_angle: angle,
          point_index: i,
          airflow: 0,
          static_pressure: 0,
          shaft_power: 0,
          efficiency: 0,
        }));
        
        await supabase.from('performance_data').insert(defaultPoints);
        await supabase.from('noise_data').insert({
          blade_config_id: bladeConfig.id,
          blade_angle: angle,
          hz63: 0, hz125: 0, hz250: 0, hz500: 0,
          hz1k: 0, hz2k: 0, hz4k: 0, hz8k: 0, overall: 0,
        });
      }
      
      return bladeConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
      toast.success('Blade configuration added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteBladeConfiguration() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (bladeConfigId: string) => {
      const { error } = await supabase
        .from('blade_configurations')
        .delete()
        .eq('id', bladeConfigId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
      toast.success('Blade configuration deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ PERFORMANCE DATA HOOKS ============
export function useUpdatePerformanceData() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      bladeConfigId, 
      bladeAngle, 
      points,
      motorPoles = null
    }: { 
      bladeConfigId: string; 
      bladeAngle: number; 
      points: FanPerformancePoint[];
      motorPoles?: number | null;
    }) => {
      // Build the delete query - include motor_poles filter
      let deleteQuery = supabase
        .from('performance_data')
        .delete()
        .eq('blade_config_id', bladeConfigId)
        .eq('blade_angle', bladeAngle);
      
      if (motorPoles === null) {
        deleteQuery = deleteQuery.is('motor_poles', null);
      } else {
        deleteQuery = deleteQuery.eq('motor_poles', motorPoles);
      }
      
      await deleteQuery;
      
      // Insert new data with motor_poles
      const rows = points.map((p, i) => ({
        blade_config_id: bladeConfigId,
        blade_angle: bladeAngle,
        point_index: i,
        airflow: p.airflow,
        static_pressure: p.staticPressure,
        shaft_power: p.shaftPower,
        efficiency: p.efficiency,
        total_efficiency: p.totalEfficiency || 0,
        motor_poles: motorPoles,
      }));
      
      const { error } = await supabase.from('performance_data').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
      toast.success('Performance data updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ NOISE DATA HOOKS ============
export function useUpdateNoiseData() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      bladeConfigId, 
      bladeAngle, 
      noiseData,
      motorPoles = null
    }: { 
      bladeConfigId: string; 
      bladeAngle: number; 
      noiseData: OctaveBandData;
      motorPoles?: number | null;
    }) => {
      // For noise data with motor_poles, we need to delete first then insert
      // because upsert with nullable columns is tricky
      let deleteQuery = supabase
        .from('noise_data')
        .delete()
        .eq('blade_config_id', bladeConfigId)
        .eq('blade_angle', bladeAngle);
      
      if (motorPoles === null) {
        deleteQuery = deleteQuery.is('motor_poles', null);
      } else {
        deleteQuery = deleteQuery.eq('motor_poles', motorPoles);
      }
      
      await deleteQuery;
      
      // Insert new noise data
      const { error } = await supabase
        .from('noise_data')
        .insert({
          blade_config_id: bladeConfigId,
          blade_angle: bladeAngle,
          hz63: noiseData.hz63,
          hz125: noiseData.hz125,
          hz250: noiseData.hz250,
          hz500: noiseData.hz500,
          hz1k: noiseData.hz1k,
          hz2k: noiseData.hz2k,
          hz4k: noiseData.hz4k,
          hz8k: noiseData.hz8k,
          overall: noiseData.overall,
          motor_poles: motorPoles,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.fanModels(tenantId || '') });
      toast.success('Noise data updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ FAN DIMENSIONS HOOKS ============
export function useFanDimensions(seriesId: string | null) {
  return useQuery({
    queryKey: fanDatabaseKeys.dimensions(seriesId || ''),
    queryFn: async () => {
      if (!seriesId) return [];
      const { data, error } = await supabase
        .from('fan_dimensions')
        .select('*')
        .eq('series_id', seriesId)
        .order('size');
      if (error) throw error;
      
      return data.map(d => ({
        size: d.size,
        phiD2: Number(d.phi_d2) || 0,
        phiD1: Number(d.phi_d1) || 0,
        phiD: Number(d.phi_d) || 0,
        H: Number(d.h) || 0,
        E: Number(d.e) || 0,
        F: Number(d.f) || 0,
        L: Number(d.l) || 0,
        K: Number(d.k) || 0,
        nPhiD: d.n_phi_d || '',
        zPhiD1: d.z_phi_d1 || '',
        motorMax: d.motor_max || '',
      })) as FanDimension[];
    },
    enabled: !!seriesId,
  });
}

// Fetch all dimensions across all series (for fan selection motor frame filtering)
export function useAllFanDimensions() {
  const { tenantId } = useAuth();
  
  return useQuery({
    queryKey: [...fanDatabaseKeys.all, 'allDimensions', tenantId],
    queryFn: async () => {
      if (!tenantId) return new Map<string, FanDimension>();
      
      const { data, error } = await supabase
        .from('fan_dimensions')
        .select('*, fan_series!inner(tenant_id)')
        .eq('fan_series.tenant_id', tenantId);
      
      if (error) throw error;
      
      // Build a map keyed by `${seriesId}-${size}`
      const dimensionsMap = new Map<string, FanDimension>();
      data.forEach(d => {
        const key = `${d.series_id}-${d.size}`;
        dimensionsMap.set(key, {
          size: d.size,
          phiD2: Number(d.phi_d2) || 0,
          phiD1: Number(d.phi_d1) || 0,
          phiD: Number(d.phi_d) || 0,
          H: Number(d.h) || 0,
          E: Number(d.e) || 0,
          F: Number(d.f) || 0,
          L: Number(d.l) || 0,
          K: Number(d.k) || 0,
          nPhiD: d.n_phi_d || '',
          zPhiD1: d.z_phi_d1 || '',
          motorMax: d.motor_max || '',
        });
      });
      
      return dimensionsMap;
    },
    enabled: !!tenantId,
  });
}

export function useUpsertFanDimension() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      seriesId, 
      dimension 
    }: { 
      seriesId: string; 
      dimension: FanDimension 
    }) => {
      const { error } = await supabase
        .from('fan_dimensions')
        .upsert({
          series_id: seriesId,
          size: dimension.size,
          phi_d2: dimension.phiD2,
          phi_d1: dimension.phiD1,
          phi_d: dimension.phiD,
          h: dimension.H,
          e: dimension.E,
          f: dimension.F,
          l: dimension.L,
          k: dimension.K,
          n_phi_d: dimension.nPhiD,
          z_phi_d1: dimension.zPhiD1,
          motor_max: dimension.motorMax,
        }, { 
          onConflict: 'series_id,size',
          ignoreDuplicates: false 
        });
      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.dimensions(seriesId) });
      toast.success('Dimension updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteFanDimension() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ seriesId, size }: { seriesId: string; size: number }) => {
      const { error } = await supabase
        .from('fan_dimensions')
        .delete()
        .eq('series_id', seriesId)
        .eq('size', size);
      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.dimensions(seriesId) });
      toast.success('Dimension deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ MOTOR BRANDS HOOKS ============
export function useMotorBrands() {
  // Always fetch from default tenant for fan selection - all users see the same motor brands
  return useQuery({
    queryKey: fanDatabaseKeys.motorBrands(DEFAULT_TENANT_ID),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motor_brands')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('name');
      if (error) throw error;
      return data.map(b => ({ id: b.id, name: b.name })) as MotorBrand[];
    },
    enabled: true,
  });
}

export function useAddMotorBrand() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (name: string) => {
      if (!tenantId) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('motor_brands')
        .insert({ name, tenant_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.motorBrands(tenantId || '') });
      toast.success('Motor brand added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteMotorBrand() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('motor_brands')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.motorBrands(tenantId || '') });
      toast.success('Motor brand deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ MOTOR SPECIFICATIONS HOOKS ============
export function useMotorSpecifications() {
  // Always fetch from default tenant for fan selection - all users see the same motor specs
  return useQuery({
    queryKey: fanDatabaseKeys.motorSpecs(DEFAULT_TENANT_ID),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motor_specifications')
        .select('*, motor_brands(name)')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('motor_poles')
        .order('rating_kw');
      if (error) throw error;
      
      return data.map(s => ({
        id: s.id,
        brandId: s.brand_id || '',
        brandName: s.motor_brands?.name || '',
        phase: s.phase || 3,
        motorPoles: s.motor_poles,
        ratingKW: Number(s.rating_kw),
        motorFrame: s.motor_frame || '',
        motorWeight: Number(s.motor_weight) || 0,
        fullLoadCurrent: Number(s.full_load_current) || 0,
        ratedCurrent: Number(s.rated_current) || 0,
        startingCurrent: Number(s.starting_current) || 0,
        voltage: Number(s.voltage) || 415,
        frequency: s.frequency || 50,
        ipRating: s.ip_rating || 'IP55',
        insulationClass: (s.insulation_class || 'F') as 'F' | 'H',
        efficiencyClass: (s.efficiency_class || 'IE3') as any,
        rpm: s.rpm || 0,
        fireRating: s.fire_rating as any,
        atexRating: (s as any).atex_rating as any,
        // Dual-speed motor fields
        is_dual_speed: (s as any).is_dual_speed || false,
        secondary_poles: (s as any).secondary_poles || null,
        secondary_rating_kw: (s as any).secondary_rating_kw ? Number((s as any).secondary_rating_kw) : null,
        secondary_rpm: (s as any).secondary_rpm || null,
        // Model locking fields
        series_id: (s as any).series_id || null,
        model_id: (s as any).model_id || null,
        series_ids: ((s as any).series_ids as string[] | null) || ((s as any).series_id ? [(s as any).series_id] : []),
        model_ids: ((s as any).model_ids as string[] | null) || ((s as any).model_id ? [(s as any).model_id] : []),
      })) as (MotorSpecification & { brandName: string; is_dual_speed?: boolean; secondary_poles?: number; secondary_rating_kw?: number; secondary_rpm?: number; series_id?: string | null; model_id?: string | null; series_ids?: string[]; model_ids?: string[] })[];
    },
    enabled: true, // Always enabled
  });
}

export function useAddMotorSpecification() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (spec: Omit<MotorSpecification, 'id'> & { isDualSpeed?: boolean; secondaryPoles?: number; secondaryRatingKW?: number; secondaryRPM?: number; seriesId?: string | null; modelId?: string | null; seriesIds?: string[]; modelIds?: string[] }) => {
      if (!tenantId) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('motor_specifications')
        .insert({
          tenant_id: tenantId,
          brand_id: spec.brandId || null,
          phase: spec.phase || 3,
          motor_poles: spec.motorPoles,
          rating_kw: spec.ratingKW,
          motor_frame: spec.motorFrame,
          motor_weight: spec.motorWeight,
          full_load_current: spec.fullLoadCurrent,
          rated_current: spec.ratedCurrent,
          starting_current: spec.startingCurrent || 0,
          voltage: spec.voltage,
          frequency: spec.frequency,
          ip_rating: spec.ipRating,
          insulation_class: spec.insulationClass,
          efficiency_class: spec.efficiencyClass,
          rpm: spec.rpm,
          fire_rating: spec.fireRating || null,
          atex_rating: spec.atexRating || null,
          is_dual_speed: spec.isDualSpeed || false,
          secondary_poles: spec.secondaryPoles || null,
          secondary_rating_kw: spec.secondaryRatingKW || null,
          secondary_rpm: spec.secondaryRPM || null,
          series_id: spec.seriesIds?.[0] ?? spec.seriesId ?? null,
          model_id: spec.modelIds?.[0] ?? spec.modelId ?? null,
          series_ids: spec.seriesIds ?? (spec.seriesId ? [spec.seriesId] : []),
          model_ids: spec.modelIds ?? (spec.modelId ? [spec.modelId] : []),
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateSharedMotorSpecs(queryClient);
      toast.success('Motor specification added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateMotorSpecification() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<MotorSpecification> & { isDualSpeed?: boolean; secondaryPoles?: number; secondaryRatingKW?: number; secondaryRPM?: number; seriesId?: string | null; modelId?: string | null; seriesIds?: string[]; modelIds?: string[] } }) => {
      const dbUpdates: any = {};
      if (updates.brandId !== undefined) dbUpdates.brand_id = updates.brandId || null;
      if (updates.phase !== undefined) dbUpdates.phase = updates.phase;
      if (updates.motorPoles !== undefined) dbUpdates.motor_poles = updates.motorPoles;
      if (updates.ratingKW !== undefined) dbUpdates.rating_kw = updates.ratingKW;
      if (updates.motorFrame !== undefined) dbUpdates.motor_frame = updates.motorFrame;
      if (updates.motorWeight !== undefined) dbUpdates.motor_weight = updates.motorWeight;
      if (updates.fullLoadCurrent !== undefined) dbUpdates.full_load_current = updates.fullLoadCurrent;
      if (updates.ratedCurrent !== undefined) dbUpdates.rated_current = updates.ratedCurrent;
      if (updates.startingCurrent !== undefined) dbUpdates.starting_current = updates.startingCurrent;
      if (updates.voltage !== undefined) dbUpdates.voltage = updates.voltage;
      if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
      if (updates.ipRating !== undefined) dbUpdates.ip_rating = updates.ipRating;
      if (updates.insulationClass !== undefined) dbUpdates.insulation_class = updates.insulationClass;
      if (updates.efficiencyClass !== undefined) dbUpdates.efficiency_class = updates.efficiencyClass;
      if (updates.rpm !== undefined) dbUpdates.rpm = updates.rpm;
      if (updates.fireRating !== undefined) dbUpdates.fire_rating = updates.fireRating || null;
      if (updates.atexRating !== undefined) dbUpdates.atex_rating = updates.atexRating || null;
      if (updates.isDualSpeed !== undefined) dbUpdates.is_dual_speed = updates.isDualSpeed;
      if (updates.secondaryPoles !== undefined) dbUpdates.secondary_poles = updates.secondaryPoles || null;
      if (updates.secondaryRatingKW !== undefined) dbUpdates.secondary_rating_kw = updates.secondaryRatingKW || null;
      if (updates.secondaryRPM !== undefined) dbUpdates.secondary_rpm = updates.secondaryRPM || null;
      if (updates.seriesIds !== undefined) {
        dbUpdates.series_ids = updates.seriesIds;
        dbUpdates.series_id = updates.seriesIds[0] ?? null;
      } else if (updates.seriesId !== undefined) {
        dbUpdates.series_id = updates.seriesId || null;
        dbUpdates.series_ids = updates.seriesId ? [updates.seriesId] : [];
      }
      if (updates.modelIds !== undefined) {
        dbUpdates.model_ids = updates.modelIds;
        dbUpdates.model_id = updates.modelIds[0] ?? null;
      } else if (updates.modelId !== undefined) {
        dbUpdates.model_id = updates.modelId || null;
        dbUpdates.model_ids = updates.modelId ? [updates.modelId] : [];
      }
      
      const { error } = await supabase
        .from('motor_specifications')
        .update(dbUpdates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSharedMotorSpecs(queryClient);
      toast.success('Motor specification updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteMotorSpecification() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('motor_specifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSharedMotorSpecs(queryClient);
      toast.success('Motor specification deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ UNIT PREFERENCES HOOKS ============
export function useUnitPreferences() {
  // Always fetch from default tenant for fan selection - all users see the same unit preferences
  return useQuery({
    queryKey: fanDatabaseKeys.unitPrefs(DEFAULT_TENANT_ID),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unit_preferences')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .maybeSingle();
      if (error) throw error;
      
      if (!data) return { 
        airflowUnit: 'CMH', 
        pressureUnit: 'Pa', 
        powerUnit: 'kW',
        defaultToleranceMin: 95,
        defaultToleranceMax: 105,
      } as UnitPreferences;
      
      return {
        airflowUnit: data.airflow_unit || 'CMH',
        pressureUnit: data.pressure_unit || 'Pa',
        powerUnit: data.power_unit || 'kW',
        defaultToleranceMin: data.default_tolerance_min ?? 95,
        defaultToleranceMax: data.default_tolerance_max ?? 105,
      } as UnitPreferences;
    },
    enabled: true,
  });
}

export function useUpdateUnitPreferences() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (prefs: Partial<UnitPreferences>) => {
      if (!tenantId) throw new Error('No tenant');
      
      const updates: any = {};
      if (prefs.airflowUnit) updates.airflow_unit = prefs.airflowUnit;
      if (prefs.pressureUnit) updates.pressure_unit = prefs.pressureUnit;
      if (prefs.powerUnit) updates.power_unit = prefs.powerUnit;
      if (prefs.defaultToleranceMin !== undefined) updates.default_tolerance_min = prefs.defaultToleranceMin;
      if (prefs.defaultToleranceMax !== undefined) updates.default_tolerance_max = prefs.defaultToleranceMax;
      
      const { error } = await supabase
        .from('unit_preferences')
        .upsert({
          tenant_id: tenantId,
          ...updates,
        }, { 
          onConflict: 'tenant_id',
          ignoreDuplicates: false 
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fanDatabaseKeys.unitPrefs(tenantId || '') });
      toast.success('Unit preferences updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ CASING WEIGHTS HOOKS ============
export function useCasingWeights(seriesId?: string | null) {
  // Fetch casing weights, optionally filtered by series
  return useQuery({
    queryKey: fanDatabaseKeys.casingWeights(DEFAULT_TENANT_ID, seriesId || undefined),
    queryFn: async () => {
      let query = supabase
        .from('casing_weights')
        .select('*, fan_series(name)')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('diameter');
      
      if (seriesId) {
        query = query.eq('series_id', seriesId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data.map(w => ({ 
        id: w.id,
        diameter: w.diameter, 
        modelName: (w as any).model_name || undefined,
        weight: Number(w.weight),
        seriesId: (w as any).series_id || undefined,
        seriesName: (w as any).fan_series?.name || undefined,
      })) as (CasingWeight & { id: string; seriesId?: string; seriesName?: string })[];
    },
    enabled: true,
  });
}

export function useUpsertCasingWeight() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ diameter, modelName, weight, seriesId }: CasingWeight & { seriesId?: string }) => {
      if (!tenantId) throw new Error('No tenant');
      
      // Check if exists by series + diameter + model_name
      let existingQuery = supabase
        .from('casing_weights')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('diameter', diameter);
      
      if (seriesId) {
        existingQuery = existingQuery.eq('series_id', seriesId);
      } else {
        existingQuery = existingQuery.is('series_id', null);
      }
      
      if (modelName) {
        existingQuery = existingQuery.eq('model_name', modelName);
      } else {
        existingQuery = existingQuery.is('model_name', null);
      }
      
      const { data: existing } = await existingQuery.maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from('casing_weights')
          .update({ weight, model_name: modelName || null })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('casing_weights')
          .insert({ 
            tenant_id: tenantId, 
            diameter, 
            model_name: modelName || null, 
            weight,
            series_id: seriesId || null 
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fanDatabase'] });
      toast.success('Casing weight updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCasingWeight() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('No tenant');
      const { error } = await supabase
        .from('casing_weights')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fanDatabase'] });
      toast.success('Casing weight deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ IMPELLER WEIGHTS HOOKS ============
export function useImpellerWeights(seriesId?: string | null) {
  // Fetch impeller weights, optionally filtered by series
  return useQuery({
    queryKey: fanDatabaseKeys.impellerWeights(DEFAULT_TENANT_ID, seriesId || undefined),
    queryFn: async () => {
      let query = supabase
        .from('impeller_weights')
        .select('*, fan_series(name)')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('diameter')
        .order('blade_count');
      
      if (seriesId) {
        query = query.eq('series_id', seriesId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data.map(w => ({ 
        id: w.id,
        diameter: w.diameter, 
        modelName: (w as any).model_name || undefined,
        bladeCount: w.blade_count,
        weight: Number(w.weight),
        seriesId: (w as any).series_id || undefined,
        seriesName: (w as any).fan_series?.name || undefined,
      })) as (ImpellerWeight & { id: string; seriesId?: string; seriesName?: string })[];
    },
    enabled: true,
  });
}

export function useUpsertImpellerWeight() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async ({ diameter, modelName, bladeCount, weight, seriesId }: ImpellerWeight & { seriesId?: string }) => {
      if (!tenantId) throw new Error('No tenant');
      
      // Check if exists by series + diameter + blade_count + model_name
      let existingQuery = supabase
        .from('impeller_weights')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('diameter', diameter)
        .eq('blade_count', bladeCount);
      
      if (seriesId) {
        existingQuery = existingQuery.eq('series_id', seriesId);
      } else {
        existingQuery = existingQuery.is('series_id', null);
      }
      
      if (modelName) {
        existingQuery = existingQuery.eq('model_name', modelName);
      } else {
        existingQuery = existingQuery.is('model_name', null);
      }
      
      const { data: existing } = await existingQuery.maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from('impeller_weights')
          .update({ weight, model_name: modelName || null })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('impeller_weights')
          .insert({ 
            tenant_id: tenantId, 
            diameter, 
            model_name: modelName || null, 
            blade_count: bladeCount, 
            weight,
            series_id: seriesId || null 
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fanDatabase'] });
      toast.success('Impeller weight updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteImpellerWeight() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('No tenant');
      const { error } = await supabase
        .from('impeller_weights')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fanDatabase'] });
      toast.success('Impeller weight deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ============ DOCUMENTATION HOOKS ============
// Always fetch from default tenant - documentation is shared across all users
export function useDocumentation() {
  return useQuery({
    queryKey: ['documentation', DEFAULT_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentation_sections')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('display_order');
      if (error) throw error;
      return data;
    },
    enabled: true, // Always enabled - documentation is public
  });
}

export function useUpsertDocumentation() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  
  return useMutation({
    mutationFn: async (sections: Array<{
      id?: string;
      section_key: string;
      title: string;
      content: string;
      display_order: number;
      is_visible: boolean;
    }>) => {
      if (!isAdmin) throw new Error('Admin access required');
      
      // Admin always updates the default tenant's documentation
      for (const section of sections) {
        const { error } = await supabase
          .from('documentation_sections')
          .upsert({
            tenant_id: DEFAULT_TENANT_ID,
            section_key: section.section_key,
            title: section.title,
            content: section.content,
            display_order: section.display_order,
            is_visible: section.is_visible,
          }, {
            onConflict: 'tenant_id,section_key',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentation', DEFAULT_TENANT_ID] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDocumentationSection() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  
  return useMutation({
    mutationFn: async (sectionKey: string) => {
      if (!isAdmin) throw new Error('Admin access required');
      
      const { error } = await supabase
        .from('documentation_sections')
        .delete()
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('section_key', sectionKey);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentation', DEFAULT_TENANT_ID] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
