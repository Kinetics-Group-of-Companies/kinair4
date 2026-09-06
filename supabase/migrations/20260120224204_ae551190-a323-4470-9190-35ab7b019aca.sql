-- Add default tolerance columns to unit_preferences table
ALTER TABLE public.unit_preferences
ADD COLUMN IF NOT EXISTS default_tolerance_min INTEGER DEFAULT 95,
ADD COLUMN IF NOT EXISTS default_tolerance_max INTEGER DEFAULT 105;