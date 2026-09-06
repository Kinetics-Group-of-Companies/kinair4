-- Create a table for accessory descriptions
CREATE TABLE public.accessory_descriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  accessory_code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, accessory_code)
);

-- Create a table for fire rating descriptions
CREATE TABLE public.fire_rating_descriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fire_class TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, fire_class)
);

-- Enable RLS
ALTER TABLE public.accessory_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_rating_descriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for accessory_descriptions
CREATE POLICY "Users can view accessory descriptions for their tenant"
ON public.accessory_descriptions FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert accessory descriptions"
ON public.accessory_descriptions FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update accessory descriptions"
ON public.accessory_descriptions FOR UPDATE
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete accessory descriptions"
ON public.accessory_descriptions FOR DELETE
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for fire_rating_descriptions
CREATE POLICY "Users can view fire rating descriptions for their tenant"
ON public.fire_rating_descriptions FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert fire rating descriptions"
ON public.fire_rating_descriptions FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update fire rating descriptions"
ON public.fire_rating_descriptions FOR UPDATE
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete fire rating descriptions"
ON public.fire_rating_descriptions FOR DELETE
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Insert default values for the default tenant
INSERT INTO public.accessory_descriptions (tenant_id, accessory_code, description) VALUES
('00000000-0000-0000-0000-000000000001', 'ET', 'Extended Terminal Box - Features an enlarged terminal enclosure for easier wiring access and additional space for electrical connections.'),
('00000000-0000-0000-0000-000000000001', 'ID', 'Inlet Deflector - Aerodynamic inlet guide designed to optimize airflow entry, reducing turbulence and improving overall fan efficiency.'),
('00000000-0000-0000-0000-000000000001', 'ETID', 'Extended Terminal Box + Inlet Deflector - Combines the benefits of both accessories for enhanced electrical access and optimized airflow performance.');

INSERT INTO public.fire_rating_descriptions (tenant_id, fire_class, description) VALUES
('00000000-0000-0000-0000-000000000001', 'F300', 'Certified for continuous operation at temperatures up to 300°C for 2 hours, suitable for smoke extraction and fire safety applications.'),
('00000000-0000-0000-0000-000000000001', 'F400', 'Certified for continuous operation at temperatures up to 400°C for 2 hours, designed for high-temperature smoke extraction in critical fire safety systems.');