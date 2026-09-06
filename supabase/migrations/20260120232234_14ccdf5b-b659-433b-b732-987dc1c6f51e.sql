-- Add series_id and model_id columns to motor_specifications for model locking
ALTER TABLE public.motor_specifications
ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.fan_series(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES public.fan_models(id) ON DELETE SET NULL;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_motor_specs_series_id ON public.motor_specifications(series_id);
CREATE INDEX IF NOT EXISTS idx_motor_specs_model_id ON public.motor_specifications(model_id);

-- Add comment to explain the feature
COMMENT ON COLUMN public.motor_specifications.series_id IS 'Optional: Lock this motor to a specific series. If NULL, motor is available for all series.';
COMMENT ON COLUMN public.motor_specifications.model_id IS 'Optional: Lock this motor to a specific model. If NULL, motor is available for all models in the series (or all models if series_id is also NULL).';