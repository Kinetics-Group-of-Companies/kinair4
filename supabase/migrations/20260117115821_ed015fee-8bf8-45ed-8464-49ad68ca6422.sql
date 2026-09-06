-- Create a table for ATEX rating descriptions
CREATE TABLE public.atex_rating_descriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  atex_code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, atex_code)
);

-- Enable RLS
ALTER TABLE public.atex_rating_descriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for atex_rating_descriptions
CREATE POLICY "Users can view atex rating descriptions for their tenant"
ON public.atex_rating_descriptions FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert atex rating descriptions"
ON public.atex_rating_descriptions FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update atex rating descriptions"
ON public.atex_rating_descriptions FOR UPDATE
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete atex rating descriptions"
ON public.atex_rating_descriptions FOR DELETE
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Insert default values for the default tenant
INSERT INTO public.atex_rating_descriptions (tenant_id, atex_code, description) VALUES
('00000000-0000-0000-0000-000000000001', 'Zone1', 'Zone 1: Gas/vapor explosive atmosphere likely during normal operation. Equipment certified Ex d (flameproof enclosure) or Ex e (increased safety).'),
('00000000-0000-0000-0000-000000000001', 'Zone2', 'Zone 2: Gas/vapor explosive atmosphere unlikely during normal operation but may occur briefly. Equipment certified Ex n (non-sparking).'),
('00000000-0000-0000-0000-000000000001', 'Zone21', 'Zone 21: Combustible dust explosive atmosphere likely during normal operation. Equipment certified Ex tD (dust ignition protection by enclosure).'),
('00000000-0000-0000-0000-000000000001', 'Zone22', 'Zone 22: Combustible dust explosive atmosphere unlikely during normal operation. Equipment certified Ex tD (dust ignition protection by enclosure).');