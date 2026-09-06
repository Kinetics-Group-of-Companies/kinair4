-- Add default safety factor to fan_series table
ALTER TABLE public.fan_series 
ADD COLUMN IF NOT EXISTS default_safety_factor numeric(4,2) DEFAULT 1.15;

-- Update existing series with default values
UPDATE public.fan_series SET default_safety_factor = 1.15 WHERE default_safety_factor IS NULL;