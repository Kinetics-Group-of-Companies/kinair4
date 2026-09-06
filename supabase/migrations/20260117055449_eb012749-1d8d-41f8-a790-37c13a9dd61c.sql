-- Create a new table for flexible series dimension schemas
-- This defines what dimension parameters each series uses
CREATE TABLE public.series_dimension_schema (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES public.fan_series(id) ON DELETE CASCADE,
  param_key TEXT NOT NULL, -- e.g., 'phi_d', 'height', 'custom_1'
  param_label TEXT NOT NULL, -- Display label e.g., 'ΦD', 'Height', 'Flange Width'
  param_type TEXT NOT NULL DEFAULT 'number', -- 'number' or 'text'
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(series_id, param_key)
);

-- Create a new table for flexible dimension values
-- Stores dimension values as JSONB keyed by param_key
CREATE TABLE public.series_dimension_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES public.fan_series(id) ON DELETE CASCADE,
  size INT NOT NULL, -- Fan size in mm
  values JSONB NOT NULL DEFAULT '{}', -- e.g., {"phi_d": 398, "height": 205, "motor_max": "80Z"}
  is_from_model BOOLEAN DEFAULT false, -- True if auto-generated from fan_models
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(series_id, size)
);

-- Enable RLS on both tables
ALTER TABLE public.series_dimension_schema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_dimension_values ENABLE ROW LEVEL SECURITY;

-- RLS policies for series_dimension_schema
CREATE POLICY "Anyone can view dimension schemas" 
ON public.series_dimension_schema FOR SELECT USING (true);

CREATE POLICY "Admins can insert dimension schemas" 
ON public.series_dimension_schema FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.fan_series fs 
    WHERE fs.id = series_id 
    AND has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Admins can update dimension schemas" 
ON public.series_dimension_schema FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.fan_series fs 
    WHERE fs.id = series_id 
    AND has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Admins can delete dimension schemas" 
ON public.series_dimension_schema FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.fan_series fs 
    WHERE fs.id = series_id 
    AND has_role(auth.uid(), 'admin')
  )
);

-- RLS policies for series_dimension_values
CREATE POLICY "Anyone can view dimension values" 
ON public.series_dimension_values FOR SELECT USING (true);

CREATE POLICY "Admins can insert dimension values" 
ON public.series_dimension_values FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.fan_series fs 
    WHERE fs.id = series_id 
    AND has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Admins can update dimension values" 
ON public.series_dimension_values FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.fan_series fs 
    WHERE fs.id = series_id 
    AND has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Admins can delete dimension values" 
ON public.series_dimension_values FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.fan_series fs 
    WHERE fs.id = series_id 
    AND has_role(auth.uid(), 'admin')
  )
);

-- Add trigger for updated_at on dimension values
CREATE TRIGGER update_series_dimension_values_updated_at
BEFORE UPDATE ON public.series_dimension_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();