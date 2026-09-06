-- Add series_id to casing_weights table
ALTER TABLE public.casing_weights 
ADD COLUMN series_id uuid REFERENCES public.fan_series(id) ON DELETE CASCADE;

-- Add series_id to impeller_weights table
ALTER TABLE public.impeller_weights 
ADD COLUMN series_id uuid REFERENCES public.fan_series(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_casing_weights_series ON public.casing_weights(series_id);
CREATE INDEX idx_impeller_weights_series ON public.impeller_weights(series_id);

-- Update unique constraints to include series_id
-- First drop old constraints if they exist, then create new ones
ALTER TABLE public.casing_weights 
DROP CONSTRAINT IF EXISTS casing_weights_diameter_tenant_id_key;

ALTER TABLE public.casing_weights
ADD CONSTRAINT casing_weights_series_diameter_key UNIQUE (series_id, diameter, model_name);

ALTER TABLE public.impeller_weights 
DROP CONSTRAINT IF EXISTS impeller_weights_diameter_blade_count_tenant_id_key;

ALTER TABLE public.impeller_weights
ADD CONSTRAINT impeller_weights_series_diameter_blade_key UNIQUE (series_id, diameter, blade_count, model_name);