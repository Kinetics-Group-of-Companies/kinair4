-- Brands
CREATE TABLE public.air_curtain_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  logo_url text,
  website text,
  notes text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_curtain_brands TO authenticated;
GRANT SELECT ON public.air_curtain_brands TO anon;
GRANT ALL ON public.air_curtain_brands TO service_role;
ALTER TABLE public.air_curtain_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view default tenant ac brands" ON public.air_curtain_brands FOR SELECT USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY "Users can view their tenant ac brands" ON public.air_curtain_brands FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can insert ac brands" ON public.air_curtain_brands FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update ac brands" ON public.air_curtain_brands FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete ac brands" ON public.air_curtain_brands FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE TRIGGER update_ac_brands_updated_at BEFORE UPDATE ON public.air_curtain_brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Series
CREATE TABLE public.air_curtain_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.air_curtain_brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'surface',
  motor_type text NOT NULL DEFAULT 'AC',
  image_url text,
  drawing_url text,
  catalogue_url text,
  datasheet_description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_curtain_series TO authenticated;
GRANT SELECT ON public.air_curtain_series TO anon;
GRANT ALL ON public.air_curtain_series TO service_role;
ALTER TABLE public.air_curtain_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view default tenant ac series" ON public.air_curtain_series FOR SELECT USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY "Users can view their tenant ac series" ON public.air_curtain_series FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can insert ac series" ON public.air_curtain_series FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update ac series" ON public.air_curtain_series FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete ac series" ON public.air_curtain_series FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE TRIGGER update_ac_series_updated_at BEFORE UPDATE ON public.air_curtain_series FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dimensions (flexible per series/model)
CREATE TABLE public.air_curtain_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES public.air_curtain_series(id) ON DELETE CASCADE,
  model_id uuid REFERENCES public.air_curtain_models(id) ON DELETE CASCADE,
  label text NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_curtain_dimensions TO authenticated;
GRANT SELECT ON public.air_curtain_dimensions TO anon;
GRANT ALL ON public.air_curtain_dimensions TO service_role;
ALTER TABLE public.air_curtain_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view default tenant ac dimensions" ON public.air_curtain_dimensions FOR SELECT USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY "Users can view their tenant ac dimensions" ON public.air_curtain_dimensions FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can insert ac dimensions" ON public.air_curtain_dimensions FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update ac dimensions" ON public.air_curtain_dimensions FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete ac dimensions" ON public.air_curtain_dimensions FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(),'admin'));
CREATE TRIGGER update_ac_dimensions_updated_at BEFORE UPDATE ON public.air_curtain_dimensions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link models to brand/series + per-model drawing
ALTER TABLE public.air_curtain_models
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.air_curtain_brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.air_curtain_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drawing_url text;