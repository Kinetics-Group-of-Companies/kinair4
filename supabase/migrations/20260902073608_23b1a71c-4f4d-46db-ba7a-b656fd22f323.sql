-- 1. Tenant-scope admin write policies on datasheet_config
DROP POLICY IF EXISTS "Admins can manage datasheet config" ON public.datasheet_config;
CREATE POLICY "Admins can manage datasheet config"
ON public.datasheet_config
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.fan_series fs
      WHERE fs.id = datasheet_config.series_id
        AND fs.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.fan_series fs
      WHERE fs.id = datasheet_config.series_id
        AND fs.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  )
);

-- 2. series_dimension_schema
DROP POLICY IF EXISTS "Admins can insert dimension schemas" ON public.series_dimension_schema;
DROP POLICY IF EXISTS "Admins can update dimension schemas" ON public.series_dimension_schema;
DROP POLICY IF EXISTS "Admins can delete dimension schemas" ON public.series_dimension_schema;

CREATE POLICY "Admins can insert dimension schemas"
ON public.series_dimension_schema FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_schema.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
);

CREATE POLICY "Admins can update dimension schemas"
ON public.series_dimension_schema FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_schema.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_schema.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
);

CREATE POLICY "Admins can delete dimension schemas"
ON public.series_dimension_schema FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_schema.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
);

-- 3. series_dimension_values
DROP POLICY IF EXISTS "Admins can insert dimension values" ON public.series_dimension_values;
DROP POLICY IF EXISTS "Admins can update dimension values" ON public.series_dimension_values;
DROP POLICY IF EXISTS "Admins can delete dimension values" ON public.series_dimension_values;

CREATE POLICY "Admins can insert dimension values"
ON public.series_dimension_values FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_values.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
);

CREATE POLICY "Admins can update dimension values"
ON public.series_dimension_values FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_values.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_values.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
);

CREATE POLICY "Admins can delete dimension values"
ON public.series_dimension_values FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_values.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())))
);

-- 4. Revoke anonymous EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon;