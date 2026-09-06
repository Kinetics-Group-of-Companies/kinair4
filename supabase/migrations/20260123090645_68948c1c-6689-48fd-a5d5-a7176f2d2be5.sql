-- Add missing fields to project_items for complete datasheet parity

-- Noise and stall settings (currently fetched from fan_series but should be stored per-item)
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS noise_distance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS noise_directivity_q integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS sound_outlet_reduction numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS stall_min_percent numeric DEFAULT 15,
ADD COLUMN IF NOT EXISTS stall_max_percent numeric DEFAULT 95;

-- VFD/Speed control settings
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS vfd_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS vfd_frequency numeric,
ADD COLUMN IF NOT EXISTS voltage_drive_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS drive_voltage numeric,
ADD COLUMN IF NOT EXISTS nominal_voltage numeric DEFAULT 415;

-- Motor specifications (detailed)
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS motor_brand_name text,
ADD COLUMN IF NOT EXISTS motor_rated_current numeric,
ADD COLUMN IF NOT EXISTS motor_full_load_current numeric,
ADD COLUMN IF NOT EXISTS motor_starting_current numeric,
ADD COLUMN IF NOT EXISTS motor_voltage numeric,
ADD COLUMN IF NOT EXISTS motor_ip_rating text,
ADD COLUMN IF NOT EXISTS motor_insulation_class text,
ADD COLUMN IF NOT EXISTS motor_efficiency_class text,
ADD COLUMN IF NOT EXISTS motor_weight numeric,
ADD COLUMN IF NOT EXISTS motor_fire_rating text,
ADD COLUMN IF NOT EXISTS motor_phase integer DEFAULT 3;

-- Weights
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS casing_weight numeric,
ADD COLUMN IF NOT EXISTS impeller_weight numeric,
ADD COLUMN IF NOT EXISTS total_weight numeric;

-- Calculated performance values (snapshot at time of save)
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS fan_rpm integer,
ADD COLUMN IF NOT EXISTS outlet_velocity numeric,
ADD COLUMN IF NOT EXISTS dynamic_pressure numeric,
ADD COLUMN IF NOT EXISTS total_pressure numeric;

-- Certifications snapshot
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS fire_class text,
ADD COLUMN IF NOT EXISTS atex_rating text,
ADD COLUMN IF NOT EXISTS selected_accessories text[] DEFAULT '{}';

-- Flexible dimensions (JSONB to store user-selected values)
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS flexible_dimension_values jsonb DEFAULT '{}';

-- Series reference for fetching logos/urls
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.fan_series(id);

-- Reference to the actual fan model used
ALTER TABLE public.project_items 
ADD COLUMN IF NOT EXISTS fan_model_id uuid REFERENCES public.fan_models(id);