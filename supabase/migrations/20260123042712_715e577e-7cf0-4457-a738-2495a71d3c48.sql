-- Add product_code column to fan_models table
ALTER TABLE public.fan_models 
ADD COLUMN product_code text UNIQUE;

-- Create an index for faster lookups
CREATE INDEX idx_fan_models_product_code ON public.fan_models(product_code) WHERE product_code IS NOT NULL;