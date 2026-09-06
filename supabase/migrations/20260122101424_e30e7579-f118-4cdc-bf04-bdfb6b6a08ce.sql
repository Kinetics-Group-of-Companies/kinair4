-- Add default noise settings to fan_series
ALTER TABLE public.fan_series 
ADD COLUMN IF NOT EXISTS default_directivity_q integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS default_noise_distance numeric DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN public.fan_series.default_directivity_q IS 'Default Sound Directivity Q factor (1=free field, 2=half-sphere, 4=quarter-sphere, 8=corner)';
COMMENT ON COLUMN public.fan_series.default_noise_distance IS 'Default distance from fan for noise calculations in meters';