import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/backend/client';

export interface DatasheetLabels {
  diameter?: string;
  blades?: string;
  bladeAngle?: string;
  motorPoles?: string;
  rpm?: string;
  weight?: string;
  airflow?: string;
  pressure?: string;
  temperature?: string;
  altitude?: string;
  density?: string;
  staticPressure?: string;
  dynamicPressure?: string;
  totalPressure?: string;
  shaftPower?: string;
  efficiency?: string;
  outletVelocity?: string;
  sfp?: string;
  brand?: string;
  frame?: string;
  power?: string;
  voltage?: string;
  frequency?: string;
  ratedCurrent?: string;
  fla?: string;
  lra?: string;
  ipRating?: string;
  insulation?: string;
}

export interface CustomCertification {
  name: string;
  logo_url?: string;
}

export type CertificationType = 'amca' | 'fire_rating' | 'ce' | 'ul' | 'iso' | 'atex' | 'custom';

export interface DatasheetConfig {
  id: string;
  series_id: string;
  show_description: boolean;
  show_duty_point: boolean;
  show_operating_point: boolean;
  show_construction: boolean;
  show_motor_characteristics: boolean;
  show_performance_curves: boolean;
  show_noise_section: boolean;
  show_octave_bands: boolean;
  show_technical_drawing: boolean;
  show_dimensions_table: boolean;
  show_certifications: boolean;
  show_standard_notes: boolean;
  custom_description: string | null;
  custom_notes: string | null;
  show_vfd_features: boolean;
  vfd_features_content: string | null;
  show_family_curve: boolean;
  custom_sections: { title: string; content: string }[];
  custom_certifications: CustomCertification[];
  // New visibility options
  show_brand_logo: boolean;
  show_series_photo: boolean;
  show_fan_curve: boolean;
  show_power_curve: boolean;
  show_efficiency_curve: boolean;
  // Individual certification toggles
  show_cert_amca: boolean;
  show_cert_fire_rating: boolean;
  show_cert_ul: boolean;
  show_cert_ce: boolean;
  // Construction & operating point detail toggles
  show_blade_count: boolean;
  show_blade_angle: boolean;
  show_efficiency: boolean;
  // Motor detail toggles
  show_motor_brand: boolean;
  show_motor_efficiency_class: boolean;
  // Certification order
  certification_order: CertificationType[];
  // Editable text fields
  header_title: string | null;
  section_title_duty_point: string | null;
  section_title_operating_point: string | null;
  section_title_construction: string | null;
  section_title_motor: string | null;
  section_title_noise: string | null;
  section_title_dimensions: string | null;
  section_title_certifications: string | null;
  standard_notes_text: string | null;
  noise_reference_text: string | null;
  noise_directive_text: string | null;
  construction_labels: DatasheetLabels | null;
  duty_point_labels: DatasheetLabels | null;
  operating_point_labels: DatasheetLabels | null;
  motor_labels: DatasheetLabels | null;
  // QR Code visibility
  show_catalogue_qr: boolean;
  show_iom_qr: boolean;
}

const DEFAULT_CERTIFICATION_ORDER: CertificationType[] = ['amca', 'fire_rating', 'ce', 'ul', 'iso', 'atex', 'custom'];

const defaultConfig: Omit<DatasheetConfig, 'id' | 'series_id'> = {
  show_description: true,
  show_duty_point: true,
  show_operating_point: true,
  show_construction: true,
  show_motor_characteristics: true,
  show_performance_curves: true,
  show_noise_section: true,
  show_octave_bands: true,
  show_technical_drawing: true,
  show_dimensions_table: true,
  show_certifications: true,
  show_standard_notes: true,
  custom_description: null,
  custom_notes: null,
  show_vfd_features: false,
  vfd_features_content: null,
  show_family_curve: false,
  custom_sections: [],
  custom_certifications: [],
  // New visibility options
  show_brand_logo: true,
  show_series_photo: true,
  show_fan_curve: true,
  show_power_curve: true,
  show_efficiency_curve: true,
  // Individual certification toggles
  show_cert_amca: true,
  show_cert_fire_rating: true,
  show_cert_ul: true,
  show_cert_ce: true,
  // Construction & operating point detail toggles
  show_blade_count: true,
  show_blade_angle: true,
  show_efficiency: true,
  // Motor detail toggles
  show_motor_brand: true,
  show_motor_efficiency_class: true,
  // Certification order
  certification_order: DEFAULT_CERTIFICATION_ORDER,
  // Default editable texts
  header_title: 'Technical Datasheet',
  section_title_duty_point: 'Duty Point',
  section_title_operating_point: 'Operating Point',
  section_title_construction: 'Construction',
  section_title_motor: 'Motor Characteristics',
  section_title_noise: 'Sound Data',
  section_title_dimensions: 'Dimensions',
  section_title_certifications: 'Certifications',
  standard_notes_text: 'Selections are based on standard air density of 1.2 kg/m³. Performance tested per ISO 5801 / AMCA 210.',
  noise_reference_text: 'Sound power levels measured per ISO 13347 / AMCA 300. Values shown at specified distance from fan inlet.',
  noise_directive_text: 'In accordance with EU Directive 2006/42/EC and EN ISO 3744. Sound power level measured at free-field conditions.',
  construction_labels: null,
  duty_point_labels: null,
  operating_point_labels: null,
  motor_labels: null,
  // QR Code visibility
  show_catalogue_qr: true,
  show_iom_qr: true,
};

export function useDatasheetConfig(seriesId: string | null) {
  return useQuery({
    queryKey: ['datasheetConfig', seriesId],
    queryFn: async () => {
      if (!seriesId) return null;
      const { data, error } = await supabase
        .from('datasheet_config')
        .select('*')
        .eq('series_id', seriesId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        return {
          ...data,
          custom_sections: (data.custom_sections as unknown as { title: string; content: string }[]) || [],
          custom_certifications: (data.custom_certifications as unknown as CustomCertification[]) || [],
          certification_order: (data.certification_order as unknown as CertificationType[]) || DEFAULT_CERTIFICATION_ORDER,
        } as DatasheetConfig;
      }
      // Return default config if none exists
      return { ...defaultConfig, id: '', series_id: seriesId } as DatasheetConfig;
    },
    enabled: !!seriesId,
  });
}

// Function to fetch config synchronously for PDF generation
export async function fetchDatasheetConfig(seriesId: string): Promise<DatasheetConfig> {
  const { data, error } = await supabase
    .from('datasheet_config')
    .select('*')
    .eq('series_id', seriesId)
    .maybeSingle();
  
  if (error) throw error;
  
  if (data) {
    return {
      ...data,
      custom_sections: (data.custom_sections as unknown as { title: string; content: string }[]) || [],
      custom_certifications: (data.custom_certifications as unknown as CustomCertification[]) || [],
      certification_order: (data.certification_order as unknown as CertificationType[]) || DEFAULT_CERTIFICATION_ORDER,
    } as DatasheetConfig;
  }
  
  // Return default config if none exists
  return { ...defaultConfig, id: '', series_id: seriesId } as DatasheetConfig;
}
