-- Add fan_type column to fan_series table to distinguish between axial and centrifugal fans
ALTER TABLE public.fan_series 
ADD COLUMN IF NOT EXISTS fan_type TEXT DEFAULT 'axial';

-- Add model_name column to fan_models for centrifugal naming like "7/7", "10/10"
ALTER TABLE public.fan_models 
ADD COLUMN IF NOT EXISTS model_name TEXT;

-- Add model_name to casing_weights for centrifugal fan support
ALTER TABLE public.casing_weights 
ADD COLUMN IF NOT EXISTS model_name TEXT;

-- Add model_name to impeller_weights for centrifugal fan support
ALTER TABLE public.impeller_weights 
ADD COLUMN IF NOT EXISTS model_name TEXT;

-- Add model_name to fan_dimensions for centrifugal fan support
ALTER TABLE public.fan_dimensions 
ADD COLUMN IF NOT EXISTS model_name TEXT;

-- Update fan_dimensions size column to be nullable for centrifugal fans that use model_name instead
ALTER TABLE public.fan_dimensions 
ALTER COLUMN size DROP NOT NULL;

-- Create index on model_name columns for faster lookups
CREATE INDEX IF NOT EXISTS idx_fan_models_model_name ON public.fan_models(model_name);
CREATE INDEX IF NOT EXISTS idx_casing_weights_model_name ON public.casing_weights(model_name);
CREATE INDEX IF NOT EXISTS idx_impeller_weights_model_name ON public.impeller_weights(model_name);
CREATE INDEX IF NOT EXISTS idx_fan_dimensions_model_name ON public.fan_dimensions(model_name);
CREATE INDEX IF NOT EXISTS idx_fan_series_fan_type ON public.fan_series(fan_type);

-- Add comment to explain the model_name usage
COMMENT ON COLUMN public.fan_models.model_name IS 'Model name for display, e.g., "7/7", "10/10" for centrifugal or "315", "400" for axial';
COMMENT ON COLUMN public.fan_series.fan_type IS 'Fan type: axial or centrifugal';