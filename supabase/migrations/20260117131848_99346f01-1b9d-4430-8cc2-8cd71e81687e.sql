-- Add new configuration columns for datasheet customization
ALTER TABLE public.datasheet_config
ADD COLUMN IF NOT EXISTS show_brand_logo boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_series_photo boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_fan_curve boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_power_curve boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_efficiency_curve boolean DEFAULT true;