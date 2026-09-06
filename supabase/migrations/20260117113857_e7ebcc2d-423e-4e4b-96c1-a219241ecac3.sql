-- Add additional certification columns to fan_series table
ALTER TABLE public.fan_series 
ADD COLUMN IF NOT EXISTS ce_certified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ce_logo_url text,
ADD COLUMN IF NOT EXISTS iso_certified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS iso_logo_url text,
ADD COLUMN IF NOT EXISTS ul_certified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ul_logo_url text,
ADD COLUMN IF NOT EXISTS atex_certified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS atex_logo_url text,
ADD COLUMN IF NOT EXISTS custom_cert_name text,
ADD COLUMN IF NOT EXISTS custom_cert_logo_url text;