-- Add show_motor_efficiency_class column for motor efficiency class visibility toggle
ALTER TABLE public.datasheet_config
ADD COLUMN IF NOT EXISTS show_motor_efficiency_class boolean DEFAULT true;