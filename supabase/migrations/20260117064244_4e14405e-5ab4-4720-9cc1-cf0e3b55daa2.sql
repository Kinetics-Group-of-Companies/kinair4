-- Create datasheet configuration table for controlling PDF sections per series
CREATE TABLE public.datasheet_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES public.fan_series(id) ON DELETE CASCADE,
  
  -- Section visibility controls
  show_description BOOLEAN NOT NULL DEFAULT true,
  show_duty_point BOOLEAN NOT NULL DEFAULT true,
  show_operating_point BOOLEAN NOT NULL DEFAULT true,
  show_construction BOOLEAN NOT NULL DEFAULT true,
  show_motor_characteristics BOOLEAN NOT NULL DEFAULT true,
  show_performance_curves BOOLEAN NOT NULL DEFAULT true,
  show_noise_section BOOLEAN NOT NULL DEFAULT true,
  show_octave_bands BOOLEAN NOT NULL DEFAULT true,
  show_technical_drawing BOOLEAN NOT NULL DEFAULT true,
  show_dimensions_table BOOLEAN NOT NULL DEFAULT true,
  show_certifications BOOLEAN NOT NULL DEFAULT true,
  show_standard_notes BOOLEAN NOT NULL DEFAULT true,
  
  -- Custom content overrides
  custom_description TEXT,
  custom_notes TEXT,
  
  -- VFD/Additional features section
  show_vfd_features BOOLEAN NOT NULL DEFAULT false,
  vfd_features_content TEXT,
  
  -- Family curve option
  show_family_curve BOOLEAN NOT NULL DEFAULT false,
  
  -- Custom sections (JSON array for flexibility)
  custom_sections JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(series_id)
);

-- Enable RLS
ALTER TABLE public.datasheet_config ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read datasheet config (needed for PDF generation)
CREATE POLICY "Datasheet config is viewable by all" 
ON public.datasheet_config 
FOR SELECT 
USING (true);

-- Policy: Only admins can modify
CREATE POLICY "Admins can manage datasheet config" 
ON public.datasheet_config 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) OR is_super_admin(auth.uid())
);

-- Add trigger for updated_at
CREATE TRIGGER update_datasheet_config_updated_at
BEFORE UPDATE ON public.datasheet_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_datasheet_config_series_id ON public.datasheet_config(series_id);