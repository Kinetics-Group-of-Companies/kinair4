-- Add certification_order column to datasheet_config table to store the display order of certifications
ALTER TABLE public.datasheet_config 
ADD COLUMN IF NOT EXISTS certification_order jsonb DEFAULT '["amca", "fire_rating", "ce", "ul", "iso", "atex", "custom"]'::jsonb;