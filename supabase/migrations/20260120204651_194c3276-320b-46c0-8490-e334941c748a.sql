-- Add blade count, blade angle, and efficiency toggles to datasheet_config
ALTER TABLE public.datasheet_config 
ADD COLUMN IF NOT EXISTS show_blade_count boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_blade_angle boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_efficiency boolean DEFAULT true;