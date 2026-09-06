-- Add sound directivity field to fan_series (dB reduction from source to outlet)
ALTER TABLE public.fan_series 
ADD COLUMN IF NOT EXISTS sound_outlet_reduction numeric DEFAULT 0;

-- Add stall limit fields to fan_series for operating limits
-- stall_airflow_percent: percentage of max airflow below which fan enters stall
ALTER TABLE public.fan_series 
ADD COLUMN IF NOT EXISTS stall_airflow_min_percent numeric DEFAULT 15,
ADD COLUMN IF NOT EXISTS stall_airflow_max_percent numeric DEFAULT 95;

-- Add column for accessories compatibility list (array of accessory codes)
ALTER TABLE public.fan_series 
ADD COLUMN IF NOT EXISTS compatible_accessories text[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.fan_series.sound_outlet_reduction IS 'dB reduction from source to outlet (outlet = source - this value)';
COMMENT ON COLUMN public.fan_series.stall_airflow_min_percent IS 'Minimum safe operating airflow as percentage of max airflow';
COMMENT ON COLUMN public.fan_series.stall_airflow_max_percent IS 'Maximum safe operating airflow as percentage of max airflow';
COMMENT ON COLUMN public.fan_series.compatible_accessories IS 'Array of accessory codes compatible with this series';