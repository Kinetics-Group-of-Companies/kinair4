-- Add public read access policies for fan data (for unauthenticated users on homepage)

-- Fan Series - Public can view all fan series for the default tenant
CREATE POLICY "Public can view fan series" 
ON public.fan_series 
FOR SELECT 
TO anon
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Fan Models - Public can view all fan models for the default tenant
CREATE POLICY "Public can view fan models" 
ON public.fan_models 
FOR SELECT 
TO anon
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Blade Configurations - Public can view blade configs for default tenant fans
CREATE POLICY "Public can view blade configs" 
ON public.blade_configurations 
FOR SELECT 
TO anon
USING (EXISTS (
  SELECT 1 FROM fan_models fm
  WHERE fm.id = blade_configurations.fan_model_id
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'
));

-- Performance Data - Public can view performance data for default tenant fans
CREATE POLICY "Public can view performance data" 
ON public.performance_data 
FOR SELECT 
TO anon
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = performance_data.blade_config_id
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'
));

-- Noise Data - Public can view noise data for default tenant fans
CREATE POLICY "Public can view noise data" 
ON public.noise_data 
FOR SELECT 
TO anon
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = noise_data.blade_config_id
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'
));

-- Motor Brands - Public can view motor brands for default tenant
CREATE POLICY "Public can view motor brands" 
ON public.motor_brands 
FOR SELECT 
TO anon
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Motor Specifications - Public can view motor specs for default tenant
CREATE POLICY "Public can view motor specs" 
ON public.motor_specifications 
FOR SELECT 
TO anon
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Unit Preferences - Public can view unit preferences for default tenant
CREATE POLICY "Public can view unit preferences" 
ON public.unit_preferences 
FOR SELECT 
TO anon
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Casing Weights - Public can view casing weights for default tenant
CREATE POLICY "Public can view casing weights" 
ON public.casing_weights 
FOR SELECT 
TO anon
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Impeller Weights - Public can view impeller weights for default tenant
CREATE POLICY "Public can view impeller weights" 
ON public.impeller_weights 
FOR SELECT 
TO anon
USING (tenant_id = '00000000-0000-0000-0000-000000000001');