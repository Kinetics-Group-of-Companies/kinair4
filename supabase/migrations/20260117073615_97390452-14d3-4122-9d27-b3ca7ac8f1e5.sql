-- Add custom certifications JSON column to datasheet_config
ALTER TABLE public.datasheet_config 
ADD COLUMN IF NOT EXISTS custom_certifications JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.datasheet_config.custom_certifications IS 'Array of custom certification objects with name and logo_url fields';