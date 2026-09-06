-- Fix RLS policies to use PERMISSIVE instead of RESTRICTIVE for SELECT operations
-- This allows users to see data from EITHER their tenant OR the default tenant

-- Drop and recreate fan_series SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view fan series" ON public.fan_series;
DROP POLICY IF EXISTS "Users can view tenant fan series" ON public.fan_series;

CREATE POLICY "Anyone can view default tenant fan series" 
ON public.fan_series FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Users can view their tenant fan series" 
ON public.fan_series FOR SELECT 
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Drop and recreate fan_models SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view fan models" ON public.fan_models;
DROP POLICY IF EXISTS "Users can view tenant fan models" ON public.fan_models;

CREATE POLICY "Anyone can view default tenant fan models" 
ON public.fan_models FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Users can view their tenant fan models" 
ON public.fan_models FOR SELECT 
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Drop and recreate blade_configurations SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view blade configs" ON public.blade_configurations;
DROP POLICY IF EXISTS "Users can view blade configs" ON public.blade_configurations;

CREATE POLICY "Anyone can view default tenant blade configs" 
ON public.blade_configurations FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM fan_models fm 
  WHERE fm.id = blade_configurations.fan_model_id 
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
));

CREATE POLICY "Users can view their tenant blade configs" 
ON public.blade_configurations FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM fan_models fm 
  WHERE fm.id = blade_configurations.fan_model_id 
  AND fm.tenant_id = get_user_tenant_id(auth.uid())
));

-- Drop and recreate performance_data SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view performance data" ON public.performance_data;
DROP POLICY IF EXISTS "Users can view performance data" ON public.performance_data;

CREATE POLICY "Anyone can view default tenant performance data" 
ON public.performance_data FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = performance_data.blade_config_id 
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
));

CREATE POLICY "Users can view their tenant performance data" 
ON public.performance_data FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = performance_data.blade_config_id 
  AND fm.tenant_id = get_user_tenant_id(auth.uid())
));

-- Drop and recreate noise_data SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view noise data" ON public.noise_data;
DROP POLICY IF EXISTS "Users can view noise data" ON public.noise_data;

CREATE POLICY "Anyone can view default tenant noise data" 
ON public.noise_data FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = noise_data.blade_config_id 
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
));

CREATE POLICY "Users can view their tenant noise data" 
ON public.noise_data FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = noise_data.blade_config_id 
  AND fm.tenant_id = get_user_tenant_id(auth.uid())
));

-- Drop and recreate motor_brands SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view motor brands" ON public.motor_brands;
DROP POLICY IF EXISTS "Users can view motor brands" ON public.motor_brands;

CREATE POLICY "Anyone can view default tenant motor brands" 
ON public.motor_brands FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Users can view their tenant motor brands" 
ON public.motor_brands FOR SELECT 
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Drop and recreate motor_specifications SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view motor specs" ON public.motor_specifications;
DROP POLICY IF EXISTS "Users can view motor specs" ON public.motor_specifications;

CREATE POLICY "Anyone can view default tenant motor specs" 
ON public.motor_specifications FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Users can view their tenant motor specs" 
ON public.motor_specifications FOR SELECT 
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Drop and recreate casing_weights SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view casing weights" ON public.casing_weights;
DROP POLICY IF EXISTS "Users can view casing weights" ON public.casing_weights;

CREATE POLICY "Anyone can view default tenant casing weights" 
ON public.casing_weights FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Users can view their tenant casing weights" 
ON public.casing_weights FOR SELECT 
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Drop and recreate impeller_weights SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view impeller weights" ON public.impeller_weights;
DROP POLICY IF EXISTS "Users can view impeller weights" ON public.impeller_weights;

CREATE POLICY "Anyone can view default tenant impeller weights" 
ON public.impeller_weights FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Users can view their tenant impeller weights" 
ON public.impeller_weights FOR SELECT 
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Drop and recreate unit_preferences SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Public can view unit preferences" ON public.unit_preferences;
DROP POLICY IF EXISTS "Users can view unit preferences" ON public.unit_preferences;

CREATE POLICY "Anyone can view default tenant unit preferences" 
ON public.unit_preferences FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Users can view their tenant unit preferences" 
ON public.unit_preferences FOR SELECT 
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Drop and recreate fan_dimensions SELECT policies as PERMISSIVE
DROP POLICY IF EXISTS "Users can view fan dimensions" ON public.fan_dimensions;

CREATE POLICY "Anyone can view default tenant fan dimensions" 
ON public.fan_dimensions FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM fan_series fs 
  WHERE fs.id = fan_dimensions.series_id 
  AND fs.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
));

CREATE POLICY "Users can view their tenant fan dimensions" 
ON public.fan_dimensions FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM fan_series fs 
  WHERE fs.id = fan_dimensions.series_id 
  AND fs.tenant_id = get_user_tenant_id(auth.uid())
));