import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import type {
  AirCurtainModel,
  AirCurtainCategory,
  AirCurtainBrand,
  AirCurtainSeries,
  AirCurtainDimensionRow,
} from '@/lib/airCurtainData';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

type Row = Record<string, unknown>;

export const mapModel = (r: Row): AirCurtainModel => ({
  id: String(r.id),
  model: String(r.model),
  category: (r.category as AirCurtainCategory) || 'surface',
  brand: (r.brand as string) || 'KINAIR',
  motorType: ((r.motor_type as string) || 'AC').toUpperCase() === 'EC' ? 'EC' : 'AC',
  brandId: str(r.brand_id),
  seriesId: str(r.series_id),
  drawingUrl: str(r.drawing_url),
  impellerDiameter: num(r.impeller_diameter),
  lengthMm: Number(r.length_mm),
  inputPowerW: num(r.input_power_w),
  inputPowerLowW: num(r.input_power_low_w),
  airVelocityMs: num(r.air_velocity_ms),
  airVelocityLowMs: num(r.air_velocity_low_ms),
  airVolumeCmh: num(r.air_volume_cmh),
  airVolumeCfm: num(r.air_volume_cfm),
  airVolumeLowCmh: num(r.air_volume_low_cmh),
  airVolumeLowCfm: num(r.air_volume_low_cfm),
  noiseDb: num(r.noise_db),
  noiseLowDb: num(r.noise_low_db),
  noise63: num(r.noise_63),
  noise125: num(r.noise_125),
  noise250: num(r.noise_250),
  noise500: num(r.noise_500),
  noise1k: num(r.noise_1k),
  noise2k: num(r.noise_2k),
  noise4k: num(r.noise_4k),
  noise8k: num(r.noise_8k),
  netWeightKg: num(r.net_weight_kg),
  grossWeightKg: num(r.gross_weight_kg),
  unitSize: str(r.unit_size),
  cartonSize: str(r.carton_size),
  mountingHeightMin: num(r.mounting_height_min),
  mountingHeightMax: num(r.mounting_height_max),
  slotWidthMm: num(r.slot_width_mm),
  voltage: str(r.voltage),
  frequencyHz: num(r.frequency_hz),
  remarks: str(r.remarks),
  displayOrder: Number(r.display_order ?? 0),
});

const mapBrand = (r: Row): AirCurtainBrand => ({
  id: String(r.id),
  name: String(r.name),
  logoUrl: str(r.logo_url),
  website: str(r.website),
  notes: str(r.notes),
  displayOrder: Number(r.display_order ?? 0),
});

const mapSeries = (r: Row): AirCurtainSeries => ({
  id: String(r.id),
  brandId: String(r.brand_id),
  name: String(r.name),
  description: str(r.description),
  category: (r.category as AirCurtainCategory) || 'surface',
  motorType: ((r.motor_type as string) || 'AC').toUpperCase() === 'EC' ? 'EC' : 'AC',
  imageUrl: str(r.image_url),
  drawingUrl: str(r.drawing_url),
  catalogueUrl: str(r.catalogue_url),
  datasheetDescription: str(r.datasheet_description),
  voltage: str(r.voltage),
  frequencyHz: num(r.frequency_hz),
  displayOrder: Number(r.display_order ?? 0),
});

const mapDimension = (r: Row): AirCurtainDimensionRow => ({
  id: String(r.id),
  seriesId: String(r.series_id),
  modelId: str(r.model_id),
  label: String(r.label),
  values: (r.values as Record<string, string | number>) || {},
  displayOrder: Number(r.display_order ?? 0),
});

/** Tenant used for reads: the user's tenant when set, otherwise the shared catalogue. */
function useReadTenant() {
  const { tenantId } = useAuth();
  return tenantId || DEFAULT_TENANT_ID;
}

export function useAirCurtainModels() {
  const tenant = useReadTenant();
  return useQuery({
    queryKey: ['airCurtainModels', tenant],
    queryFn: async (): Promise<AirCurtainModel[]> => {
      const { data, error } = await supabase
        .from('air_curtain_models')
        .select('*')
        .in('tenant_id', Array.from(new Set([tenant, DEFAULT_TENANT_ID])))
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => mapModel(r as Row));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useAirCurtainBrands() {
  const tenant = useReadTenant();
  return useQuery({
    queryKey: ['airCurtainBrands', tenant],
    queryFn: async (): Promise<AirCurtainBrand[]> => {
      const { data, error } = await supabase
        .from('air_curtain_brands')
        .select('*')
        .in('tenant_id', Array.from(new Set([tenant, DEFAULT_TENANT_ID])))
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => mapBrand(r as Row));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useAirCurtainSeries() {
  const tenant = useReadTenant();
  return useQuery({
    queryKey: ['airCurtainSeries', tenant],
    queryFn: async (): Promise<AirCurtainSeries[]> => {
      const { data, error } = await supabase
        .from('air_curtain_series')
        .select('*')
        .in('tenant_id', Array.from(new Set([tenant, DEFAULT_TENANT_ID])))
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => mapSeries(r as Row));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useAirCurtainDimensions() {
  const tenant = useReadTenant();
  return useQuery({
    queryKey: ['airCurtainDimensions', tenant],
    queryFn: async (): Promise<AirCurtainDimensionRow[]> => {
      const { data, error } = await supabase
        .from('air_curtain_dimensions')
        .select('*')
        .in('tenant_id', Array.from(new Set([tenant, DEFAULT_TENANT_ID])))
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => mapDimension(r as Row));
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Generic admin write helpers for the air curtain tables. */
type AcTable = 'air_curtain_brands' | 'air_curtain_series' | 'air_curtain_models' | 'air_curtain_dimensions';

const QUERY_KEY: Record<AcTable, string> = {
  air_curtain_brands: 'airCurtainBrands',
  air_curtain_series: 'airCurtainSeries',
  air_curtain_models: 'airCurtainModels',
  air_curtain_dimensions: 'airCurtainDimensions',
};

export function useAirCurtainMutations(table: AcTable) {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY[table]] });

  const create = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!tenantId) throw new Error('No tenant');
      const { data, error } = await supabase
        .from(table)
        .insert({ ...values, tenant_id: tenantId } as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { data, error } = await supabase.from(table).update(values as never).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Row was not updated — you may not have permission to edit this catalogue entry.');
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/** Upload an air curtain asset (logo, photo, drawing) and return its public URL. */
export async function uploadAirCurtainAsset(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `air-curtains/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('brand-assets').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('brand-assets').getPublicUrl(path);
  return data.publicUrl;
}
