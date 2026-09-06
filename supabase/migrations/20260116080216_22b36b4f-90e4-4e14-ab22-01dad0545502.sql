
-- Drop existing restrictive policies and recreate as permissive
-- FAN_SERIES policies
DROP POLICY IF EXISTS "Users can view tenant fan series" ON public.fan_series;
DROP POLICY IF EXISTS "Admins can insert fan series" ON public.fan_series;
DROP POLICY IF EXISTS "Admins can update fan series" ON public.fan_series;
DROP POLICY IF EXISTS "Admins can delete fan series" ON public.fan_series;

CREATE POLICY "Users can view tenant fan series"
  ON public.fan_series FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert fan series"
  ON public.fan_series FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fan series"
  ON public.fan_series FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete fan series"
  ON public.fan_series FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- FAN_MODELS policies
DROP POLICY IF EXISTS "Users can view tenant fan models" ON public.fan_models;
DROP POLICY IF EXISTS "Admins can insert fan models" ON public.fan_models;
DROP POLICY IF EXISTS "Admins can update fan models" ON public.fan_models;
DROP POLICY IF EXISTS "Admins can delete fan models" ON public.fan_models;

CREATE POLICY "Users can view tenant fan models"
  ON public.fan_models FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert fan models"
  ON public.fan_models FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fan models"
  ON public.fan_models FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete fan models"
  ON public.fan_models FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- BLADE_CONFIGURATIONS policies
DROP POLICY IF EXISTS "Users can view blade configs" ON public.blade_configurations;
DROP POLICY IF EXISTS "Admins can insert blade configs" ON public.blade_configurations;
DROP POLICY IF EXISTS "Admins can update blade configs" ON public.blade_configurations;
DROP POLICY IF EXISTS "Admins can delete blade configs" ON public.blade_configurations;

CREATE POLICY "Users can view blade configs"
  ON public.blade_configurations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fan_models fm
    WHERE fm.id = blade_configurations.fan_model_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Admins can insert blade configs"
  ON public.blade_configurations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fan_models fm
    WHERE fm.id = blade_configurations.fan_model_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update blade configs"
  ON public.blade_configurations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fan_models fm
    WHERE fm.id = blade_configurations.fan_model_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete blade configs"
  ON public.blade_configurations FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fan_models fm
    WHERE fm.id = blade_configurations.fan_model_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

-- MOTOR_BRANDS policies
DROP POLICY IF EXISTS "Users can view motor brands" ON public.motor_brands;
DROP POLICY IF EXISTS "Admins can manage motor brands" ON public.motor_brands;

CREATE POLICY "Users can view motor brands"
  ON public.motor_brands FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert motor brands"
  ON public.motor_brands FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update motor brands"
  ON public.motor_brands FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete motor brands"
  ON public.motor_brands FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- MOTOR_SPECIFICATIONS policies
DROP POLICY IF EXISTS "Users can view motor specs" ON public.motor_specifications;
DROP POLICY IF EXISTS "Admins can manage motor specs" ON public.motor_specifications;

CREATE POLICY "Users can view motor specs"
  ON public.motor_specifications FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert motor specs"
  ON public.motor_specifications FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update motor specs"
  ON public.motor_specifications FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete motor specs"
  ON public.motor_specifications FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- CASING_WEIGHTS policies
DROP POLICY IF EXISTS "Users can view casing weights" ON public.casing_weights;
DROP POLICY IF EXISTS "Admins can manage casing weights" ON public.casing_weights;

CREATE POLICY "Users can view casing weights"
  ON public.casing_weights FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert casing weights"
  ON public.casing_weights FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update casing weights"
  ON public.casing_weights FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete casing weights"
  ON public.casing_weights FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- IMPELLER_WEIGHTS policies
DROP POLICY IF EXISTS "Users can view impeller weights" ON public.impeller_weights;
DROP POLICY IF EXISTS "Admins can manage impeller weights" ON public.impeller_weights;

CREATE POLICY "Users can view impeller weights"
  ON public.impeller_weights FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert impeller weights"
  ON public.impeller_weights FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update impeller weights"
  ON public.impeller_weights FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete impeller weights"
  ON public.impeller_weights FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- UNIT_PREFERENCES policies
DROP POLICY IF EXISTS "Users can view unit preferences" ON public.unit_preferences;
DROP POLICY IF EXISTS "Admins can manage unit preferences" ON public.unit_preferences;

CREATE POLICY "Users can view unit preferences"
  ON public.unit_preferences FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert unit preferences"
  ON public.unit_preferences FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update unit preferences"
  ON public.unit_preferences FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete unit preferences"
  ON public.unit_preferences FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- TENANTS policies (for logo/company updates)
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Admins can update own tenant" ON public.tenants;

CREATE POLICY "Users can view own tenant"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can update own tenant"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- FAN_DIMENSIONS policies
DROP POLICY IF EXISTS "Users can view fan dimensions" ON public.fan_dimensions;
DROP POLICY IF EXISTS "Admins can manage fan dimensions" ON public.fan_dimensions;

CREATE POLICY "Users can view fan dimensions"
  ON public.fan_dimensions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fan_series fs
    WHERE fs.id = fan_dimensions.series_id
    AND fs.tenant_id = get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Admins can insert fan dimensions"
  ON public.fan_dimensions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fan_series fs
    WHERE fs.id = fan_dimensions.series_id
    AND fs.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fan dimensions"
  ON public.fan_dimensions FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fan_series fs
    WHERE fs.id = fan_dimensions.series_id
    AND fs.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete fan dimensions"
  ON public.fan_dimensions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fan_series fs
    WHERE fs.id = fan_dimensions.series_id
    AND fs.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

-- PERFORMANCE_DATA policies
DROP POLICY IF EXISTS "Users can view performance data" ON public.performance_data;
DROP POLICY IF EXISTS "Admins can manage performance data" ON public.performance_data;

CREATE POLICY "Users can view performance data"
  ON public.performance_data FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = performance_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Admins can insert performance data"
  ON public.performance_data FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = performance_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update performance data"
  ON public.performance_data FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = performance_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete performance data"
  ON public.performance_data FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = performance_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

-- NOISE_DATA policies
DROP POLICY IF EXISTS "Users can view noise data" ON public.noise_data;
DROP POLICY IF EXISTS "Admins can manage noise data" ON public.noise_data;

CREATE POLICY "Users can view noise data"
  ON public.noise_data FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = noise_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Admins can insert noise data"
  ON public.noise_data FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = noise_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update noise data"
  ON public.noise_data FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = noise_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete noise data"
  ON public.noise_data FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM blade_configurations bc
    JOIN fan_models fm ON fm.id = bc.fan_model_id
    WHERE bc.id = noise_data.blade_config_id
    AND fm.tenant_id = get_user_tenant_id(auth.uid())
  ) AND has_role(auth.uid(), 'admin'));
