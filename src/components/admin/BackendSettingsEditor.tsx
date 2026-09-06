import { useState } from 'react';
import { Database, Download, FileText, Server, Key, Copy, Check, AlertTriangle, Info, Loader2, CheckCircle, XCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/backend/client';
import { toast } from 'sonner';

interface BackendSettingsEditorProps {
  tenantId: string | null;
}

interface MigrationResult {
  success: boolean;
  message: string;
  totalRecords: number;
  tables: Record<string, { success: boolean; count: number; error?: string }>;
  storage: Record<string, { success: boolean; count: number; error?: string }>;
}

export function BackendSettingsEditor({ tenantId }: BackendSettingsEditorProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [customSupabaseUrl, setCustomSupabaseUrl] = useState('');
  const [customAnonKey, setCustomAnonKey] = useState('');
  const [customServiceKey, setCustomServiceKey] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [poolerHost, setPoolerHost] = useState('');

  // Current configuration (read-only from environment)
  const currentConfig = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 'Not configured',
    projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID || 'Not configured',
    anonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'Not configured',
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const exportDatabaseSchema = async () => {
    setExporting(true);
    try {
      // Export table data from all relevant tables
      const tables = [
        'fan_series',
        'fan_models',
        'blade_configurations',
        'performance_data',
        'noise_data',
        'fan_dimensions',
        'motor_brands',
        'motor_specifications',
        'casing_weights',
        'impeller_weights',
        'unit_preferences',
        'datasheet_config',
        'documentation_sections',
        'page_content',
        'accessory_descriptions',
        'fire_rating_descriptions',
        'atex_rating_descriptions',
        'series_dimension_schema',
        'series_dimension_values',
      ];

      const exportData: Record<string, any[]> = {};

      for (const table of tables) {
        try {
          const { data, error } = await supabase
            .from(table as any)
            .select('*');
          
          if (error) {
            console.warn(`Could not export ${table}:`, error.message);
            exportData[table] = [];
          } else {
            exportData[table] = data || [];
          }
        } catch (e) {
          console.warn(`Could not export ${table}:`, e);
          exportData[table] = [];
        }
      }

      // Create downloadable JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `database-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Database exported successfully');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export database');
    } finally {
      setExporting(false);
    }
  };

  const exportMigrationSQL = () => {
    // Generate a comprehensive SQL script that creates all tables, types, functions, RLS policies
    const fullSchemaSQL = `-- ================================================
-- VENTILATION4U COMPLETE DATABASE SCHEMA
-- Generated: ${new Date().toISOString()}
-- ================================================
-- 
-- INSTRUCTIONS:
-- 1. Create a new Supabase project at https://supabase.com
-- 2. Go to SQL Editor in your Supabase dashboard
-- 3. Copy and paste this ENTIRE script
-- 4. Click "Run" to execute
-- 5. Return to the app and run the data migration
--
-- ================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ================================================
-- STEP 1: Create ENUMs
-- ================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ================================================
-- STEP 2: Create all Tables
-- ================================================

-- Tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  factory_address TEXT,
  favicon_url TEXT,
  google_maps_url TEXT,
  subscription_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  subscription_end TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id),
  display_name TEXT,
  email TEXT,
  is_approved BOOLEAN DEFAULT false,
  approval_requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- User Roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role DEFAULT 'user'
);

-- Fan Series table
CREATE TABLE IF NOT EXISTS public.fan_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  fan_type TEXT DEFAULT 'axial',
  image_url TEXT,
  drawing_url TEXT,
  catalogue_url TEXT,
  iom_url TEXT,
  datasheet_description TEXT,
  nomenclature_template TEXT DEFAULT '{series}-{size}',
  fire_rating VARCHAR,
  amca_certified BOOLEAN DEFAULT false,
  ce_certified BOOLEAN DEFAULT false,
  iso_certified BOOLEAN DEFAULT false,
  ul_certified BOOLEAN DEFAULT false,
  atex_certified BOOLEAN DEFAULT false,
  amca_logo_url TEXT,
  ce_logo_url TEXT,
  iso_logo_url TEXT,
  ul_logo_url TEXT,
  atex_logo_url TEXT,
  fire_rating_logo_url TEXT,
  custom_cert_name TEXT,
  custom_cert_logo_url TEXT,
  show_octave_bands BOOLEAN DEFAULT true NOT NULL,
  default_safety_factor NUMERIC DEFAULT 1.15,
  default_directivity_q INTEGER DEFAULT 2,
  default_noise_distance NUMERIC DEFAULT 0,
  sound_outlet_reduction NUMERIC DEFAULT 0,
  stall_airflow_min_percent NUMERIC DEFAULT 15,
  stall_airflow_max_percent NUMERIC DEFAULT 95,
  compatible_accessories TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Fan Models table
CREATE TABLE IF NOT EXISTS public.fan_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  series_id UUID REFERENCES public.fan_series(id),
  diameter INTEGER NOT NULL,
  model_name TEXT,
  product_code TEXT,
  drawing_url TEXT,
  motor_poles INTEGER[] DEFAULT '{2,4,6,8,12}',
  reference_poles INTEGER DEFAULT 4,
  insulation_class TEXT,
  ip_rating TEXT,
  weight NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Blade Configurations table
CREATE TABLE IF NOT EXISTS public.blade_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_model_id UUID NOT NULL REFERENCES public.fan_models(id),
  blade_count INTEGER NOT NULL,
  blade_angles INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Performance Data table
CREATE TABLE IF NOT EXISTS public.performance_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blade_config_id UUID NOT NULL REFERENCES public.blade_configurations(id),
  blade_angle INTEGER NOT NULL,
  point_index INTEGER NOT NULL,
  airflow NUMERIC NOT NULL,
  static_pressure NUMERIC NOT NULL,
  shaft_power NUMERIC NOT NULL,
  efficiency NUMERIC NOT NULL,
  total_efficiency NUMERIC DEFAULT 0,
  motor_poles INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Noise Data table
CREATE TABLE IF NOT EXISTS public.noise_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blade_config_id UUID NOT NULL REFERENCES public.blade_configurations(id),
  blade_angle INTEGER NOT NULL,
  motor_poles INTEGER,
  hz63 NUMERIC,
  hz125 NUMERIC,
  hz250 NUMERIC,
  hz500 NUMERIC,
  hz1k NUMERIC,
  hz2k NUMERIC,
  hz4k NUMERIC,
  hz8k NUMERIC,
  overall NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Fan Dimensions table
CREATE TABLE IF NOT EXISTS public.fan_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.fan_series(id),
  size INTEGER,
  model_name TEXT,
  phi_d NUMERIC,
  phi_d1 NUMERIC,
  phi_d2 NUMERIC,
  h NUMERIC,
  e NUMERIC,
  f NUMERIC,
  l NUMERIC,
  k NUMERIC,
  n_phi_d TEXT,
  z_phi_d1 TEXT,
  motor_max TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Motor Brands table
CREATE TABLE IF NOT EXISTS public.motor_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Motor Specifications table
CREATE TABLE IF NOT EXISTS public.motor_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  brand_id UUID REFERENCES public.motor_brands(id),
  series_id UUID REFERENCES public.fan_series(id),
  model_id UUID REFERENCES public.fan_models(id),
  motor_poles INTEGER NOT NULL,
  rating_kw NUMERIC NOT NULL,
  motor_frame TEXT,
  motor_weight NUMERIC,
  full_load_current NUMERIC,
  rated_current NUMERIC,
  starting_current NUMERIC,
  voltage NUMERIC DEFAULT 415,
  frequency INTEGER DEFAULT 50,
  rpm INTEGER,
  phase INTEGER DEFAULT 3,
  ip_rating TEXT DEFAULT 'IP55',
  insulation_class TEXT DEFAULT 'F',
  efficiency_class TEXT DEFAULT 'IE3',
  fire_rating TEXT,
  atex_rating TEXT,
  is_dual_speed BOOLEAN DEFAULT false,
  secondary_poles INTEGER,
  secondary_rating_kw NUMERIC,
  secondary_rpm INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Casing Weights table
CREATE TABLE IF NOT EXISTS public.casing_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  series_id UUID REFERENCES public.fan_series(id),
  diameter INTEGER NOT NULL,
  model_name TEXT,
  weight NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Impeller Weights table
CREATE TABLE IF NOT EXISTS public.impeller_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  series_id UUID REFERENCES public.fan_series(id),
  diameter INTEGER NOT NULL,
  blade_count INTEGER NOT NULL,
  model_name TEXT,
  weight NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Unit Preferences table
CREATE TABLE IF NOT EXISTS public.unit_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id),
  airflow_unit TEXT DEFAULT 'CMH',
  pressure_unit TEXT DEFAULT 'Pa',
  power_unit TEXT DEFAULT 'kW',
  default_tolerance_min NUMERIC,
  default_tolerance_max NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Datasheet Config table
CREATE TABLE IF NOT EXISTS public.datasheet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL UNIQUE REFERENCES public.fan_series(id),
  header_title TEXT DEFAULT 'Technical Datasheet',
  show_description BOOLEAN DEFAULT true NOT NULL,
  show_duty_point BOOLEAN DEFAULT true NOT NULL,
  show_operating_point BOOLEAN DEFAULT true NOT NULL,
  show_construction BOOLEAN DEFAULT true NOT NULL,
  show_motor_characteristics BOOLEAN DEFAULT true NOT NULL,
  show_performance_curves BOOLEAN DEFAULT true NOT NULL,
  show_noise_section BOOLEAN DEFAULT true NOT NULL,
  show_octave_bands BOOLEAN DEFAULT true NOT NULL,
  show_technical_drawing BOOLEAN DEFAULT true NOT NULL,
  show_dimensions_table BOOLEAN DEFAULT true NOT NULL,
  show_certifications BOOLEAN DEFAULT true NOT NULL,
  show_standard_notes BOOLEAN DEFAULT true NOT NULL,
  show_vfd_features BOOLEAN DEFAULT false NOT NULL,
  show_family_curve BOOLEAN DEFAULT false NOT NULL,
  show_brand_logo BOOLEAN DEFAULT true,
  show_series_photo BOOLEAN DEFAULT true,
  show_fan_curve BOOLEAN DEFAULT true,
  show_power_curve BOOLEAN DEFAULT true,
  show_efficiency_curve BOOLEAN DEFAULT true,
  show_blade_count BOOLEAN DEFAULT true,
  show_blade_angle BOOLEAN DEFAULT true,
  show_efficiency BOOLEAN DEFAULT true,
  show_motor_brand BOOLEAN DEFAULT true,
  show_motor_efficiency_class BOOLEAN DEFAULT true,
  show_cert_amca BOOLEAN DEFAULT true,
  show_cert_fire_rating BOOLEAN DEFAULT true,
  show_cert_ul BOOLEAN DEFAULT true,
  show_cert_ce BOOLEAN DEFAULT true,
  show_catalogue_qr BOOLEAN DEFAULT true,
  show_iom_qr BOOLEAN DEFAULT true,
  section_title_duty_point TEXT DEFAULT 'Duty Point',
  section_title_operating_point TEXT DEFAULT 'Operating Point',
  section_title_motor TEXT DEFAULT 'Motor Characteristics',
  section_title_construction TEXT DEFAULT 'Construction',
  section_title_noise TEXT DEFAULT 'Sound Data',
  section_title_certifications TEXT DEFAULT 'Certifications',
  section_title_dimensions TEXT DEFAULT 'Dimensions',
  duty_point_labels JSONB DEFAULT '{"airflow": "Airflow", "pressure": "Static Pressure", "altitude": "Altitude", "temperature": "Temperature", "density": "Air Density"}',
  operating_point_labels JSONB DEFAULT '{"airflow": "Airflow", "staticPressure": "Static Pressure", "dynamicPressure": "Dynamic Pressure", "totalPressure": "Total Pressure", "shaftPower": "Shaft Power", "efficiency": "Efficiency", "outletVelocity": "Outlet Velocity", "sfp": "SFP"}',
  motor_labels JSONB DEFAULT '{"brand": "Brand", "power": "Power", "frame": "Frame", "voltage": "Voltage", "frequency": "Frequency", "ratedCurrent": "Rated Current", "fla": "FLA", "lra": "LRA", "ipRating": "IP Rating", "insulation": "Insulation", "efficiency": "Efficiency Class"}',
  construction_labels JSONB DEFAULT '{"diameter": "Diameter", "blades": "Blades", "bladeAngle": "Blade Angle", "motorPoles": "Motor Poles", "rpm": "Speed (RPM)", "weight": "Total Weight"}',
  certification_order JSONB DEFAULT '["amca", "fire_rating", "ce", "ul", "iso", "atex", "custom"]',
  custom_certifications JSONB DEFAULT '[]',
  custom_sections JSONB DEFAULT '[]',
  custom_description TEXT,
  custom_notes TEXT,
  vfd_features_content TEXT,
  noise_directive_text TEXT DEFAULT 'In accordance with EU Directive 2006/42/EC and EN ISO 3744. Sound power level measured at free-field conditions.',
  noise_reference_text TEXT DEFAULT 'Sound power levels measured per ISO 13347 / AMCA 300. Values shown at specified distance from fan inlet.',
  standard_notes_text TEXT DEFAULT 'Selections are based on standard air density of 1.2 kg/m³. Performance tested per ISO 5801 / AMCA 210.',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Documentation Sections table
CREATE TABLE IF NOT EXISTS public.documentation_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  display_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Page Content table
CREATE TABLE IF NOT EXISTS public.page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  page_key TEXT NOT NULL,
  section_key TEXT NOT NULL,
  title TEXT,
  content TEXT,
  display_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Accessory Descriptions table
CREATE TABLE IF NOT EXISTS public.accessory_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  accessory_code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Fire Rating Descriptions table
CREATE TABLE IF NOT EXISTS public.fire_rating_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  fire_class TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ATEX Rating Descriptions table
CREATE TABLE IF NOT EXISTS public.atex_rating_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  atex_code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Series Dimension Schema table
CREATE TABLE IF NOT EXISTS public.series_dimension_schema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.fan_series(id),
  param_key TEXT NOT NULL,
  param_label TEXT NOT NULL,
  param_type TEXT DEFAULT 'number' NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Series Dimension Values table
CREATE TABLE IF NOT EXISTS public.series_dimension_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.fan_series(id),
  size INTEGER NOT NULL,
  values JSONB DEFAULT '{}',
  is_from_model BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  project_reference TEXT,
  status TEXT DEFAULT 'draft' NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT projects_status_check CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'completed'))
);

-- Project Items table
CREATE TABLE IF NOT EXISTS public.project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  series_id UUID REFERENCES public.fan_series(id),
  fan_model_id UUID REFERENCES public.fan_models(id),
  series_name TEXT NOT NULL,
  diameter INTEGER NOT NULL,
  blade_count INTEGER NOT NULL,
  blade_angle INTEGER NOT NULL,
  motor_poles INTEGER NOT NULL,
  required_airflow NUMERIC NOT NULL,
  required_pressure NUMERIC NOT NULL,
  operating_airflow NUMERIC,
  operating_pressure NUMERIC,
  shaft_power NUMERIC,
  efficiency NUMERIC,
  motor_rating_kw NUMERIC,
  motor_frame TEXT,
  motor_brand_name TEXT,
  motor_rated_current NUMERIC,
  motor_full_load_current NUMERIC,
  motor_starting_current NUMERIC,
  motor_voltage NUMERIC,
  motor_ip_rating TEXT,
  motor_insulation_class TEXT,
  motor_efficiency_class TEXT,
  motor_weight NUMERIC,
  motor_fire_rating TEXT,
  motor_phase INTEGER DEFAULT 3,
  altitude NUMERIC DEFAULT 0,
  temperature NUMERIC DEFAULT 20,
  air_density NUMERIC DEFAULT 1.2,
  frequency INTEGER DEFAULT 50,
  quantity INTEGER DEFAULT 1 NOT NULL,
  unit_price NUMERIC,
  notes TEXT,
  nomenclature TEXT,
  datasheet_url TEXT,
  airflow_unit TEXT DEFAULT 'CMH',
  pressure_unit TEXT DEFAULT 'Pa',
  noise_distance NUMERIC DEFAULT 0,
  noise_directivity_q INTEGER DEFAULT 2,
  sound_outlet_reduction NUMERIC DEFAULT 0,
  stall_min_percent NUMERIC DEFAULT 15,
  stall_max_percent NUMERIC DEFAULT 95,
  vfd_enabled BOOLEAN DEFAULT false,
  vfd_frequency NUMERIC,
  voltage_drive_enabled BOOLEAN DEFAULT false,
  drive_voltage NUMERIC,
  nominal_voltage NUMERIC DEFAULT 415,
  casing_weight NUMERIC,
  impeller_weight NUMERIC,
  total_weight NUMERIC,
  fan_rpm INTEGER,
  outlet_velocity NUMERIC,
  dynamic_pressure NUMERIC,
  total_pressure NUMERIC,
  fire_class TEXT,
  atex_rating TEXT,
  selected_accessories TEXT[] DEFAULT '{}',
  flexible_dimension_values JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ================================================
-- STEP 3: Create Functions
-- ================================================

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id 
    AND email IN ('chndeepak7@gmail.com', 'deepak@kineticsgroup.ae')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id
    WHERE p.user_id = _user_id 
    AND p.is_approved = true
    AND t.is_active = true
    AND (t.subscription_end IS NULL OR t.subscription_end > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name, email, is_active, subscription_start, subscription_end)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 
    NEW.email, 
    true,
    NOW(),
    NOW() + INTERVAL '30 days'
  )
  RETURNING id INTO new_tenant_id;
  
  INSERT INTO public.profiles (user_id, tenant_id, display_name, email, is_approved, approval_requested_at)
  VALUES (
    NEW.id, 
    new_tenant_id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    false,
    NOW()
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

-- ================================================
-- STEP 4: Create Triggers
-- ================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_email();

-- ================================================
-- STEP 5: Enable Row Level Security
-- ================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blade_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noise_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casing_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impeller_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasheet_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessory_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_rating_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atex_rating_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_dimension_schema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_dimension_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

-- ================================================
-- STEP 6: Create Storage Buckets
-- ================================================
-- Run this in SQL Editor after the tables are created:

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('brand-assets', 'brand-assets', true, ARRAY['image/*', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('project-datasheets', 'project-datasheets', true, ARRAY['image/*', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- COMPLETE! Now go back and run the data migration.
-- ================================================
`;

    const blob = new Blob([fullSchemaSQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'complete-schema-setup.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Complete database schema downloaded! Run this in your Supabase SQL Editor first.');
  };

  const saveCustomConfig = () => {
    // Note: This creates a downloadable .env file
    // The actual switching would require code changes
    const envContent = `# Custom Supabase Configuration
# Generated: ${new Date().toISOString()}
# 
# INSTRUCTIONS:
# 1. Export this project from GitHub (if not already done)
# 2. Clone the repository to your local machine
# 3. Replace the .env file with these values
# 4. Run: npm install && npm run build
# 5. Deploy to your preferred hosting platform

VITE_SUPABASE_URL=${customSupabaseUrl || 'https://YOUR_PROJECT_ID.supabase.co'}
VITE_SUPABASE_PUBLISHABLE_KEY=${customAnonKey || 'your_anon_key_here'}
VITE_SUPABASE_PROJECT_ID=${customSupabaseUrl?.match(/https:\/\/([^.]+)/)?.[1] || 'your_project_id'}
`;

    const blob = new Blob([envContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'env-config.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Environment configuration downloaded');
  };

  // Generate schema SQL string for sending to edge function
  const generateSchemaSQL = (): string => {
    return `-- Auto-generated schema for migration
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Create ENUMs
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  factory_address TEXT,
  favicon_url TEXT,
  google_maps_url TEXT,
  subscription_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  subscription_end TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id),
  display_name TEXT,
  email TEXT,
  is_approved BOOLEAN DEFAULT false,
  approval_requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- User Roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role DEFAULT 'user'
);

-- Fan Series table
CREATE TABLE IF NOT EXISTS public.fan_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  fan_type TEXT DEFAULT 'axial',
  image_url TEXT,
  drawing_url TEXT,
  catalogue_url TEXT,
  iom_url TEXT,
  datasheet_description TEXT,
  nomenclature_template TEXT DEFAULT '{series}-{size}',
  fire_rating VARCHAR,
  amca_certified BOOLEAN DEFAULT false,
  ce_certified BOOLEAN DEFAULT false,
  iso_certified BOOLEAN DEFAULT false,
  ul_certified BOOLEAN DEFAULT false,
  atex_certified BOOLEAN DEFAULT false,
  amca_logo_url TEXT,
  ce_logo_url TEXT,
  iso_logo_url TEXT,
  ul_logo_url TEXT,
  atex_logo_url TEXT,
  fire_rating_logo_url TEXT,
  custom_cert_name TEXT,
  custom_cert_logo_url TEXT,
  show_octave_bands BOOLEAN DEFAULT true NOT NULL,
  default_safety_factor NUMERIC DEFAULT 1.15,
  default_directivity_q INTEGER DEFAULT 2,
  default_noise_distance NUMERIC DEFAULT 0,
  sound_outlet_reduction NUMERIC DEFAULT 0,
  stall_airflow_min_percent NUMERIC DEFAULT 15,
  stall_airflow_max_percent NUMERIC DEFAULT 95,
  compatible_accessories TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Fan Models table
CREATE TABLE IF NOT EXISTS public.fan_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  series_id UUID REFERENCES public.fan_series(id),
  diameter INTEGER NOT NULL,
  model_name TEXT,
  product_code TEXT,
  drawing_url TEXT,
  motor_poles INTEGER[] DEFAULT '{2,4,6,8,12}',
  reference_poles INTEGER DEFAULT 4,
  insulation_class TEXT,
  ip_rating TEXT,
  weight NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Blade Configurations table
CREATE TABLE IF NOT EXISTS public.blade_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_model_id UUID NOT NULL REFERENCES public.fan_models(id),
  blade_count INTEGER NOT NULL,
  blade_angles INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Performance Data table
CREATE TABLE IF NOT EXISTS public.performance_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blade_config_id UUID NOT NULL REFERENCES public.blade_configurations(id),
  blade_angle INTEGER NOT NULL,
  point_index INTEGER NOT NULL,
  airflow NUMERIC NOT NULL,
  static_pressure NUMERIC NOT NULL,
  shaft_power NUMERIC NOT NULL,
  efficiency NUMERIC NOT NULL,
  total_efficiency NUMERIC DEFAULT 0,
  motor_poles INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Noise Data table
CREATE TABLE IF NOT EXISTS public.noise_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blade_config_id UUID NOT NULL REFERENCES public.blade_configurations(id),
  blade_angle INTEGER NOT NULL,
  motor_poles INTEGER,
  hz63 NUMERIC,
  hz125 NUMERIC,
  hz250 NUMERIC,
  hz500 NUMERIC,
  hz1k NUMERIC,
  hz2k NUMERIC,
  hz4k NUMERIC,
  hz8k NUMERIC,
  overall NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Fan Dimensions table
CREATE TABLE IF NOT EXISTS public.fan_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.fan_series(id),
  size INTEGER,
  model_name TEXT,
  phi_d NUMERIC,
  phi_d1 NUMERIC,
  phi_d2 NUMERIC,
  h NUMERIC,
  e NUMERIC,
  f NUMERIC,
  l NUMERIC,
  k NUMERIC,
  n_phi_d TEXT,
  z_phi_d1 TEXT,
  motor_max TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Motor Brands table
CREATE TABLE IF NOT EXISTS public.motor_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Motor Specifications table
CREATE TABLE IF NOT EXISTS public.motor_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  brand_id UUID REFERENCES public.motor_brands(id),
  series_id UUID REFERENCES public.fan_series(id),
  model_id UUID REFERENCES public.fan_models(id),
  motor_poles INTEGER NOT NULL,
  rating_kw NUMERIC NOT NULL,
  motor_frame TEXT,
  motor_weight NUMERIC,
  full_load_current NUMERIC,
  rated_current NUMERIC,
  starting_current NUMERIC,
  voltage NUMERIC DEFAULT 415,
  frequency INTEGER DEFAULT 50,
  rpm INTEGER,
  phase INTEGER DEFAULT 3,
  ip_rating TEXT DEFAULT 'IP55',
  insulation_class TEXT DEFAULT 'F',
  efficiency_class TEXT DEFAULT 'IE3',
  fire_rating TEXT,
  atex_rating TEXT,
  is_dual_speed BOOLEAN DEFAULT false,
  secondary_poles INTEGER,
  secondary_rating_kw NUMERIC,
  secondary_rpm INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Casing Weights table
CREATE TABLE IF NOT EXISTS public.casing_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  series_id UUID REFERENCES public.fan_series(id),
  diameter INTEGER NOT NULL,
  model_name TEXT,
  weight NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Impeller Weights table
CREATE TABLE IF NOT EXISTS public.impeller_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  series_id UUID REFERENCES public.fan_series(id),
  diameter INTEGER NOT NULL,
  blade_count INTEGER NOT NULL,
  model_name TEXT,
  weight NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Unit Preferences table
CREATE TABLE IF NOT EXISTS public.unit_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id),
  airflow_unit TEXT DEFAULT 'CMH',
  pressure_unit TEXT DEFAULT 'Pa',
  power_unit TEXT DEFAULT 'kW',
  default_tolerance_min NUMERIC,
  default_tolerance_max NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Datasheet Config table
CREATE TABLE IF NOT EXISTS public.datasheet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL UNIQUE REFERENCES public.fan_series(id),
  header_title TEXT DEFAULT 'Technical Datasheet',
  show_description BOOLEAN DEFAULT true NOT NULL,
  show_duty_point BOOLEAN DEFAULT true NOT NULL,
  show_operating_point BOOLEAN DEFAULT true NOT NULL,
  show_construction BOOLEAN DEFAULT true NOT NULL,
  show_motor_characteristics BOOLEAN DEFAULT true NOT NULL,
  show_performance_curves BOOLEAN DEFAULT true NOT NULL,
  show_noise_section BOOLEAN DEFAULT true NOT NULL,
  show_octave_bands BOOLEAN DEFAULT true NOT NULL,
  show_technical_drawing BOOLEAN DEFAULT true NOT NULL,
  show_dimensions_table BOOLEAN DEFAULT true NOT NULL,
  show_certifications BOOLEAN DEFAULT true NOT NULL,
  show_standard_notes BOOLEAN DEFAULT true NOT NULL,
  show_vfd_features BOOLEAN DEFAULT false NOT NULL,
  show_family_curve BOOLEAN DEFAULT false NOT NULL,
  show_brand_logo BOOLEAN DEFAULT true,
  show_series_photo BOOLEAN DEFAULT true,
  show_fan_curve BOOLEAN DEFAULT true,
  show_power_curve BOOLEAN DEFAULT true,
  show_efficiency_curve BOOLEAN DEFAULT true,
  show_blade_count BOOLEAN DEFAULT true,
  show_blade_angle BOOLEAN DEFAULT true,
  show_efficiency BOOLEAN DEFAULT true,
  show_motor_brand BOOLEAN DEFAULT true,
  show_motor_efficiency_class BOOLEAN DEFAULT true,
  show_cert_amca BOOLEAN DEFAULT true,
  show_cert_fire_rating BOOLEAN DEFAULT true,
  show_cert_ul BOOLEAN DEFAULT true,
  show_cert_ce BOOLEAN DEFAULT true,
  show_catalogue_qr BOOLEAN DEFAULT true,
  show_iom_qr BOOLEAN DEFAULT true,
  section_title_duty_point TEXT DEFAULT 'Duty Point',
  section_title_operating_point TEXT DEFAULT 'Operating Point',
  section_title_motor TEXT DEFAULT 'Motor Characteristics',
  section_title_construction TEXT DEFAULT 'Construction',
  section_title_noise TEXT DEFAULT 'Sound Data',
  section_title_certifications TEXT DEFAULT 'Certifications',
  section_title_dimensions TEXT DEFAULT 'Dimensions',
  duty_point_labels JSONB DEFAULT '{"airflow": "Airflow", "pressure": "Static Pressure", "altitude": "Altitude", "temperature": "Temperature", "density": "Air Density"}',
  operating_point_labels JSONB DEFAULT '{"airflow": "Airflow", "staticPressure": "Static Pressure", "dynamicPressure": "Dynamic Pressure", "totalPressure": "Total Pressure", "shaftPower": "Shaft Power", "efficiency": "Efficiency", "outletVelocity": "Outlet Velocity", "sfp": "SFP"}',
  motor_labels JSONB DEFAULT '{"brand": "Brand", "power": "Power", "frame": "Frame", "voltage": "Voltage", "frequency": "Frequency", "ratedCurrent": "Rated Current", "fla": "FLA", "lra": "LRA", "ipRating": "IP Rating", "insulation": "Insulation", "efficiency": "Efficiency Class"}',
  construction_labels JSONB DEFAULT '{"diameter": "Diameter", "blades": "Blades", "bladeAngle": "Blade Angle", "motorPoles": "Motor Poles", "rpm": "Speed (RPM)", "weight": "Total Weight"}',
  certification_order JSONB DEFAULT '["amca", "fire_rating", "ce", "ul", "iso", "atex", "custom"]',
  custom_certifications JSONB DEFAULT '[]',
  custom_sections JSONB DEFAULT '[]',
  custom_description TEXT,
  custom_notes TEXT,
  vfd_features_content TEXT,
  noise_directive_text TEXT DEFAULT 'In accordance with EU Directive 2006/42/EC and EN ISO 3744.',
  noise_reference_text TEXT DEFAULT 'Sound power levels measured per ISO 13347 / AMCA 300.',
  standard_notes_text TEXT DEFAULT 'Selections are based on standard air density of 1.2 kg/m³.',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Documentation Sections table
CREATE TABLE IF NOT EXISTS public.documentation_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  display_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Page Content table
CREATE TABLE IF NOT EXISTS public.page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  page_key TEXT NOT NULL,
  section_key TEXT NOT NULL,
  title TEXT,
  content TEXT,
  display_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Accessory Descriptions table
CREATE TABLE IF NOT EXISTS public.accessory_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  accessory_code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Fire Rating Descriptions table
CREATE TABLE IF NOT EXISTS public.fire_rating_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  fire_class TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ATEX Rating Descriptions table
CREATE TABLE IF NOT EXISTS public.atex_rating_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  atex_code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Series Dimension Schema table
CREATE TABLE IF NOT EXISTS public.series_dimension_schema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.fan_series(id),
  param_key TEXT NOT NULL,
  param_label TEXT NOT NULL,
  param_type TEXT DEFAULT 'number' NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Series Dimension Values table
CREATE TABLE IF NOT EXISTS public.series_dimension_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.fan_series(id),
  size INTEGER NOT NULL,
  values JSONB DEFAULT '{}',
  is_from_model BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  project_reference TEXT,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  status TEXT DEFAULT 'draft' NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Project Items table
CREATE TABLE IF NOT EXISTS public.project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  fan_model_id UUID REFERENCES public.fan_models(id),
  series_id UUID REFERENCES public.fan_series(id),
  series_name TEXT NOT NULL,
  diameter INTEGER NOT NULL,
  blade_count INTEGER NOT NULL,
  blade_angle INTEGER NOT NULL,
  motor_poles INTEGER NOT NULL,
  required_airflow NUMERIC NOT NULL,
  required_pressure NUMERIC NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  nomenclature TEXT,
  airflow_unit TEXT DEFAULT 'CMH',
  pressure_unit TEXT DEFAULT 'Pa',
  altitude NUMERIC DEFAULT 0,
  temperature NUMERIC DEFAULT 20,
  air_density NUMERIC DEFAULT 1.2,
  frequency INTEGER DEFAULT 50,
  operating_airflow NUMERIC,
  operating_pressure NUMERIC,
  dynamic_pressure NUMERIC,
  total_pressure NUMERIC,
  shaft_power NUMERIC,
  efficiency NUMERIC,
  fan_rpm INTEGER,
  outlet_velocity NUMERIC,
  motor_rating_kw NUMERIC,
  motor_frame TEXT,
  motor_brand_name TEXT,
  motor_voltage NUMERIC,
  motor_phase INTEGER DEFAULT 3,
  motor_rated_current NUMERIC,
  motor_full_load_current NUMERIC,
  motor_starting_current NUMERIC,
  motor_insulation_class TEXT,
  motor_ip_rating TEXT,
  motor_efficiency_class TEXT,
  motor_weight NUMERIC,
  motor_fire_rating TEXT,
  casing_weight NUMERIC,
  impeller_weight NUMERIC,
  total_weight NUMERIC,
  fire_class TEXT,
  atex_rating TEXT,
  selected_accessories TEXT[] DEFAULT '{}',
  vfd_enabled BOOLEAN DEFAULT false,
  vfd_frequency NUMERIC,
  voltage_drive_enabled BOOLEAN DEFAULT false,
  drive_voltage NUMERIC,
  nominal_voltage NUMERIC DEFAULT 415,
  noise_distance NUMERIC DEFAULT 0,
  noise_directivity_q INTEGER DEFAULT 2,
  sound_outlet_reduction NUMERIC DEFAULT 0,
  stall_min_percent NUMERIC DEFAULT 15,
  stall_max_percent NUMERIC DEFAULT 95,
  flexible_dimension_values JSONB DEFAULT '{}',
  datasheet_url TEXT,
  notes TEXT,
  unit_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('project-datasheets', 'project-datasheets', true) ON CONFLICT (id) DO NOTHING;

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blade_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noise_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casing_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impeller_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasheet_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessory_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_rating_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atex_rating_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_dimension_schema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_dimension_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

-- Create helper functions
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT tenant_id FROM public.profiles WHERE user_id = _user_id $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id AND email IN ('chndeepak7@gmail.com', 'deepak@kineticsgroup.ae')) $$;

-- Basic permissive policies for data import (can be tightened later)
CREATE POLICY "Allow all on tenants" ON public.tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_roles" ON public.user_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on fan_series" ON public.fan_series FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on fan_models" ON public.fan_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on blade_configurations" ON public.blade_configurations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on performance_data" ON public.performance_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on noise_data" ON public.noise_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on fan_dimensions" ON public.fan_dimensions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on motor_brands" ON public.motor_brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on motor_specifications" ON public.motor_specifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on casing_weights" ON public.casing_weights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on impeller_weights" ON public.impeller_weights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on unit_preferences" ON public.unit_preferences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on datasheet_config" ON public.datasheet_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on documentation_sections" ON public.documentation_sections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on page_content" ON public.page_content FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on accessory_descriptions" ON public.accessory_descriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on fire_rating_descriptions" ON public.fire_rating_descriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on atex_rating_descriptions" ON public.atex_rating_descriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on series_dimension_schema" ON public.series_dimension_schema FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on series_dimension_values" ON public.series_dimension_values FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on project_items" ON public.project_items FOR ALL USING (true) WITH CHECK (true);
`;
  };

  const runMigration = async () => {
    if (!customSupabaseUrl || !customAnonKey || !customServiceKey || !dbPassword || !poolerHost) {
      toast.error('Please fill in all fields including database password and pooler host');
      return;
    }

    if (!tenantId) {
      toast.error('Tenant ID not available');
      return;
    }

    setMigrating(true);
    setMigrationResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error('Please log in to perform migration');
        return;
      }

      // Extract project ref from URL
      const projectRef = customSupabaseUrl.match(/https:\/\/([^.]+)/)?.[1];
      if (!projectRef) {
        toast.error('Invalid Supabase URL format');
        return;
      }

      const schemaSQL = generateSchemaSQL();

      const response = await supabase.functions.invoke('migrate-database', {
        body: {
          targetUrl: customSupabaseUrl,
          targetAnonKey: customAnonKey,
          targetServiceKey: customServiceKey,
          tenantId: tenantId,
          dbPassword: dbPassword,
          projectRef: projectRef,
          schemaSQL: schemaSQL,
          poolerHost: poolerHost,
        },
      });

      if (response.error) {
        console.error('Migration error:', response.error);
        toast.error(`Migration failed: ${response.error.message}`);
        return;
      }

      const result = response.data as MigrationResult;
      setMigrationResult(result);
      
      if (result.success) {
        toast.success(`Migration completed! ${result.totalRecords} records migrated.`);
      } else {
        toast.warning('Migration completed with some errors. Check the results below.');
      }
    } catch (err) {
      console.error('Migration exception:', err);
      toast.error('Migration failed. Please check your credentials and try again.');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Backend Settings</h2>
        <p className="text-muted-foreground">Manage your backend configuration and prepare for independent deployment</p>
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="config" className="gap-2">
            <Server className="w-4 h-4" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="w-4 h-4" />
            Export Data
          </TabsTrigger>
          <TabsTrigger value="migrate" className="gap-2">
            <FileText className="w-4 h-4" />
            Migration Guide
          </TabsTrigger>
          <TabsTrigger value="custom" className="gap-2">
            <Key className="w-4 h-4" />
            Custom Backend
          </TabsTrigger>
        </TabsList>

        {/* Current Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                Current Backend Configuration
              </CardTitle>
              <CardDescription>
                Your application is currently connected to Lovable Cloud (powered by Supabase)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Project URL</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={currentConfig.supabaseUrl} 
                      readOnly 
                      className="font-mono text-sm bg-muted"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(currentConfig.supabaseUrl, 'url')}
                    >
                      {copiedField === 'url' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Project ID</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={currentConfig.projectId} 
                      readOnly 
                      className="font-mono text-sm bg-muted"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(currentConfig.projectId, 'id')}
                    >
                      {copiedField === 'id' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Anonymous Key (Public)</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={currentConfig.anonKey.substring(0, 50) + '...'} 
                      readOnly 
                      className="font-mono text-sm bg-muted"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(currentConfig.anonKey, 'key')}
                    >
                      {copiedField === 'key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Tenant ID</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={tenantId || 'Not available'} 
                      readOnly 
                      className="font-mono text-sm bg-muted"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(tenantId || '', 'tenant')}
                    >
                      {copiedField === 'tenant' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Connection Status</AlertTitle>
                <AlertDescription>
                  Your backend is active and connected. All data is stored securely in the cloud.
                </AlertDescription>
              </Alert>

              <div className="pt-4 border-t">
                <h4 className="font-semibold text-sm mb-3">Revert to Lovable Cloud</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  If you've migrated to your own Supabase and want to switch back, download this .env file for your hosting platform.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    const envContent = `# Lovable Cloud Configuration
# Use these values to revert to Lovable Cloud backend
# Add these to your Vercel/Netlify environment variables

VITE_SUPABASE_URL=${currentConfig.supabaseUrl}
VITE_SUPABASE_PUBLISHABLE_KEY=${currentConfig.anonKey}
VITE_SUPABASE_PROJECT_ID=${currentConfig.projectId}
`;
                    const blob = new Blob([envContent], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'lovable-cloud-env.txt';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success('Lovable Cloud configuration downloaded');
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Lovable Cloud .env
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Data Tab */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Export Database
              </CardTitle>
              <CardDescription>
                Download your complete database for backup or migration to your own backend
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center space-y-4">
                    <Database className="w-12 h-12 mx-auto text-primary" />
                    <div>
                      <h3 className="font-semibold">Export All Data (JSON)</h3>
                      <p className="text-sm text-muted-foreground">
                        Downloads all fan series, models, performance data, motor specs, and configurations
                      </p>
                    </div>
                    <Button 
                      onClick={exportDatabaseSchema} 
                      disabled={exporting}
                      className="w-full"
                    >
                      {exporting ? 'Exporting...' : 'Export Data as JSON'}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardContent className="p-6 text-center space-y-4">
                    <FileText className="w-12 h-12 mx-auto text-primary" />
                    <div>
                      <h3 className="font-semibold">Download Migration SQL</h3>
                      <p className="text-sm text-muted-foreground">
                        Get SQL scripts to recreate the database schema in your own Supabase project
                      </p>
                    </div>
                    <Button 
                      onClick={exportMigrationSQL}
                      variant="outline"
                      className="w-full"
                    >
                      Download SQL Script
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  Exports include only data you have access to. Storage files (images, PDFs) need to be downloaded separately.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Migration Guide Tab */}
        <TabsContent value="migrate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Migration Guide
              </CardTitle>
              <CardDescription>
                Step-by-step instructions to run this application independently
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="step1">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">1</span>
                      Export Code from Lovable
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-muted-foreground">
                    <p>1. Click the <strong>GitHub</strong> button in Lovable editor</p>
                    <p>2. Connect your GitHub account if not already connected</p>
                    <p>3. Create a new repository or connect to existing one</p>
                    <p>4. Clone the repository: <code className="bg-muted px-2 py-1 rounded">git clone your-repo-url</code></p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step2">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">2</span>
                      Create Your Own Supabase Project
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-muted-foreground">
                    <p>1. Go to <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">supabase.com</a> and create an account</p>
                    <p>2. Create a new project (choose a region close to your users)</p>
                    <p>3. Wait for the project to be provisioned (takes ~2 minutes)</p>
                    <p>4. Note down your Project URL and API keys from Settings → API</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step3">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">3</span>
                      Run Database Migrations
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-muted-foreground">
                    <p>1. In your Supabase dashboard, go to SQL Editor</p>
                    <p>2. Find migration files in your code: <code className="bg-muted px-2 py-1 rounded">supabase/migrations/</code></p>
                    <p>3. Run each migration file in order (by timestamp)</p>
                    <p>4. Verify tables are created in Table Editor</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step4">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">4</span>
                      Import Your Data
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-muted-foreground">
                    <p>1. Use the "Export Data" tab to download your JSON data</p>
                    <p>2. In Supabase Table Editor, use "Insert rows" for each table</p>
                    <p>3. Or use the Supabase CLI: <code className="bg-muted px-2 py-1 rounded">supabase db push</code></p>
                    <p>4. Upload storage files to the new buckets manually</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step5">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">5</span>
                      Update Environment Variables
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-muted-foreground">
                    <p>1. Create a <code className="bg-muted px-2 py-1 rounded">.env</code> file in your project root</p>
                    <p>2. Add your new Supabase credentials:</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id`}
                    </pre>
                    <p>3. Use the "Custom Backend" tab to generate this file</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step6">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">6</span>
                      Deploy Your Application
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-muted-foreground">
                    <p>1. Install dependencies: <code className="bg-muted px-2 py-1 rounded">npm install</code></p>
                    <p>2. Build the project: <code className="bg-muted px-2 py-1 rounded">npm run build</code></p>
                    <p>3. Deploy to your preferred platform:</p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li><a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Vercel</a> - Recommended, free tier available</li>
                      <li><a href="https://netlify.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Netlify</a> - Easy deployment</li>
                      <li><a href="https://pages.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Cloudflare Pages</a> - Fast global CDN</li>
                      <li>Your own server with nginx/Apache</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Custom Backend Tab */}
        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Migrate to Your Own Supabase
              </CardTitle>
              <CardDescription>
                Enter your Supabase credentials to automatically copy all data to your own database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-green-500/10 border-green-500/30">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-600 font-bold">✅ Fully Automatic Migration</AlertTitle>
                <AlertDescription>
                  <p className="mt-2">Just create a new Supabase project and enter your credentials below. The migration will automatically:</p>
                  <ul className="list-disc list-inside space-y-1 mt-2 text-sm">
                    <li><strong>Create all database tables and schema</strong></li>
                    <li>Create storage buckets (brand-assets, project-datasheets)</li>
                    <li>Copy all your data (fans, motors, projects, etc.)</li>
                    <li>Copy all uploaded files (logos, PDFs, images)</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supabaseUrl">Supabase Project URL *</Label>
                  <Input 
                    id="supabaseUrl"
                    placeholder="https://your-project-id.supabase.co"
                    value={customSupabaseUrl}
                    onChange={(e) => setCustomSupabaseUrl(e.target.value)}
                    disabled={migrating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in: Settings → API → Project URL
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="anonKey">Anonymous Key (anon/public) *</Label>
                  <Input 
                    id="anonKey"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={customAnonKey}
                    onChange={(e) => setCustomAnonKey(e.target.value)}
                    disabled={migrating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in: Settings → API → anon public
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serviceKey">Service Role Key *</Label>
                  <Input 
                    id="serviceKey"
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={customServiceKey}
                    onChange={(e) => setCustomServiceKey(e.target.value)}
                    disabled={migrating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in: Settings → API → service_role (secret)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dbPassword">Database Password *</Label>
                  <Input 
                    id="dbPassword"
                    type="password"
                    placeholder="Your database password"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    disabled={migrating}
                  />
                  <p className="text-xs text-muted-foreground">
                    The password you set when creating your Supabase project. Found in: Settings → Database → Connection string
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="poolerHost">Pooler Host *</Label>
                  <Input 
                    id="poolerHost"
                    placeholder="aws-1-ap-south-1.pooler.supabase.com"
                    value={poolerHost}
                    onChange={(e) => setPoolerHost(e.target.value)}
                    disabled={migrating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in your POSTGRES_URL: <code className="bg-muted px-1">@<strong>aws-X-region.pooler.supabase.com</strong>:6543</code>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={runMigration}
                  disabled={!customSupabaseUrl || !customAnonKey || !customServiceKey || !dbPassword || !poolerHost || migrating}
                  className="flex-1"
                  variant="default"
                >
                  {migrating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Migrating (creating schema + copying data)...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Start Full Automatic Migration
                    </>
                  )}
                </Button>
                <Button 
                  onClick={saveCustomConfig}
                  disabled={!customSupabaseUrl || !customAnonKey}
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download .env
                </Button>
              </div>

              {migrating && (
                <div className="space-y-2">
                  <Progress value={undefined} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    Creating schema, copying tables and storage files... This may take a few minutes.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Migration Results */}
          {migrationResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {migrationResult.success ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  )}
                  Migration Results
                </CardTitle>
                <CardDescription>
                  {migrationResult.message}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <h4 className="font-semibold text-sm">Tables ({migrationResult.totalRecords} records)</h4>
                  <div className="grid gap-1 max-h-60 overflow-y-auto">
                    {Object.entries(migrationResult.tables).map(([table, result]) => (
                      <div key={table} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
                        {result.success ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className="font-mono">{table}</span>
                        <span className="text-muted-foreground ml-auto">
                          {result.count} rows
                        </span>
                        {result.error && (
                          <span className="text-red-500 text-xs truncate max-w-32" title={result.error}>
                            {result.error}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {Object.keys(migrationResult.storage).length > 0 && (
                  <div className="grid gap-2">
                    <h4 className="font-semibold text-sm">Storage Buckets</h4>
                    <div className="grid gap-1">
                      {Object.entries(migrationResult.storage).map(([bucket, result]) => (
                        <div key={bucket} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
                          {result.success ? (
                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                          <span className="font-mono">{bucket}</span>
                          <span className="text-muted-foreground ml-auto">
                            {result.count} files
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Next Steps</AlertTitle>
                  <AlertDescription>
                    <ol className="list-decimal list-inside space-y-1 mt-2">
                      <li>Download the .env file using the button above</li>
                      <li>Export your code to GitHub using the Lovable editor</li>
                      <li>Deploy to Vercel, Netlify, or your preferred host with the new .env values</li>
                      <li>Your app will now run independently with your own Supabase!</li>
                    </ol>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Storage Buckets Required</CardTitle>
              <CardDescription>Create these buckets in your new Supabase project before migration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  <Database className="w-4 h-4 text-primary" />
                  <span className="font-mono text-sm">brand-assets</span>
                  <span className="text-xs text-muted-foreground ml-auto">Public bucket for logos, favicons</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  <Database className="w-4 h-4 text-primary" />
                  <span className="font-mono text-sm">project-datasheets</span>
                  <span className="text-xs text-muted-foreground ml-auto">Public bucket for generated PDFs</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                In Supabase Dashboard → Storage → New bucket. Set both as "Public" buckets.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
