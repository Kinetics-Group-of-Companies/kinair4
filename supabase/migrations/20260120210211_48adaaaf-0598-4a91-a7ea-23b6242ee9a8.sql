-- Add show_motor_brand column for motor brand visibility toggle
ALTER TABLE public.datasheet_config
ADD COLUMN IF NOT EXISTS show_motor_brand boolean DEFAULT true;