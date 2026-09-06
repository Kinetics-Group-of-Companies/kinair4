-- Drop the restrictive default tenant policies and recreate as permissive
-- This allows ANY authenticated user (including pending approval) to view default tenant data

-- fan_models
DROP POLICY IF EXISTS "Anyone can view default tenant fan models" ON public.fan_models;
CREATE POLICY "Anyone can view default tenant fan models" 
ON public.fan_models 
FOR SELECT 
TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- fan_series
DROP POLICY IF EXISTS "Anyone can view default tenant fan series" ON public.fan_series;
CREATE POLICY "Anyone can view default tenant fan series" 
ON public.fan_series 
FOR SELECT 
TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- blade_configurations
DROP POLICY IF EXISTS "Anyone can view default tenant blade configs" ON public.blade_configurations;
CREATE POLICY "Anyone can view default tenant blade configs" 
ON public.blade_configurations 
FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM fan_models fm 
  WHERE fm.id = blade_configurations.fan_model_id 
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'
));

-- performance_data
DROP POLICY IF EXISTS "Anyone can view default tenant performance data" ON public.performance_data;
CREATE POLICY "Anyone can view default tenant performance data" 
ON public.performance_data 
FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = performance_data.blade_config_id 
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'
));

-- noise_data
DROP POLICY IF EXISTS "Anyone can view default tenant noise data" ON public.noise_data;
CREATE POLICY "Anyone can view default tenant noise data" 
ON public.noise_data 
FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM blade_configurations bc
  JOIN fan_models fm ON fm.id = bc.fan_model_id
  WHERE bc.id = noise_data.blade_config_id 
  AND fm.tenant_id = '00000000-0000-0000-0000-000000000001'
));

-- fan_dimensions
DROP POLICY IF EXISTS "Anyone can view default tenant fan dimensions" ON public.fan_dimensions;
CREATE POLICY "Anyone can view default tenant fan dimensions" 
ON public.fan_dimensions 
FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM fan_series fs
  WHERE fs.id = fan_dimensions.series_id 
  AND fs.tenant_id = '00000000-0000-0000-0000-000000000001'
));

-- casing_weights
DROP POLICY IF EXISTS "Anyone can view default tenant casing weights" ON public.casing_weights;
CREATE POLICY "Anyone can view default tenant casing weights" 
ON public.casing_weights 
FOR SELECT 
TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- impeller_weights
DROP POLICY IF EXISTS "Anyone can view default tenant impeller weights" ON public.impeller_weights;
CREATE POLICY "Anyone can view default tenant impeller weights" 
ON public.impeller_weights 
FOR SELECT 
TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- motor_specifications
DROP POLICY IF EXISTS "Anyone can view default tenant motor specs" ON public.motor_specifications;
CREATE POLICY "Anyone can view default tenant motor specs" 
ON public.motor_specifications 
FOR SELECT 
TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- unit_preferences
DROP POLICY IF EXISTS "Anyone can view default tenant unit prefs" ON public.unit_preferences;
CREATE POLICY "Anyone can view default tenant unit prefs" 
ON public.unit_preferences 
FOR SELECT 
TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001');