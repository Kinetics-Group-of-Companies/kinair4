-- Add catalogue and IOM URLs to fan_series table
ALTER TABLE public.fan_series
ADD COLUMN IF NOT EXISTS catalogue_url TEXT,
ADD COLUMN IF NOT EXISTS iom_url TEXT;

-- Add Google Maps URL to tenants table for location embedding
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.fan_series.catalogue_url IS 'URL to the downloadable product catalogue PDF for this series';
COMMENT ON COLUMN public.fan_series.iom_url IS 'URL to the Installation and Operation Manual PDF for this series';
COMMENT ON COLUMN public.tenants.google_maps_url IS 'Google Maps embed URL for displaying company location';