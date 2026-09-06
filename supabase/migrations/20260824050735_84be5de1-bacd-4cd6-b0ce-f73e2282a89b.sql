
-- 1. brand-assets storage: admin-only writes
DROP POLICY IF EXISTS "Authenticated users can upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete brand assets" ON storage.objects;

CREATE POLICY "Admins can upload brand assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brand-assets' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE POLICY "Admins can update brand assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-assets' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())))
WITH CHECK (bucket_id = 'brand-assets' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE POLICY "Admins can delete brand assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'brand-assets' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

-- 2. project-datasheets storage: owner/tenant scoped
DROP POLICY IF EXISTS "Anyone can view project datasheets" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload datasheets to their projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their datasheets" ON storage.objects;

CREATE POLICY "Project members can view datasheets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-datasheets'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND (p.user_id = auth.uid() OR p.tenant_id = public.get_user_tenant_id(auth.uid()))
  )
);

CREATE POLICY "Project members can upload datasheets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-datasheets'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND (p.user_id = auth.uid() OR p.tenant_id = public.get_user_tenant_id(auth.uid()))
  )
);

CREATE POLICY "Project members can delete datasheets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-datasheets'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND (p.user_id = auth.uid() OR p.tenant_id = public.get_user_tenant_id(auth.uid()))
  )
);

-- 3. datasheet_config: authenticated tenant-scoped reads
DROP POLICY IF EXISTS "Datasheet config is viewable by all" ON public.datasheet_config;
CREATE POLICY "Tenant users can view datasheet config"
ON public.datasheet_config FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = datasheet_config.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

-- 4. series dimension schema/values: authenticated tenant-scoped reads
DROP POLICY IF EXISTS "Anyone can view dimension schemas" ON public.series_dimension_schema;
CREATE POLICY "Tenant users can view dimension schemas"
ON public.series_dimension_schema FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_schema.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Anyone can view dimension values" ON public.series_dimension_values;
CREATE POLICY "Tenant users can view dimension values"
ON public.series_dimension_values FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.fan_series fs
    WHERE fs.id = series_dimension_values.series_id
      AND fs.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

-- 5. profiles: tenant-scoped admin access
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles for approval" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

CREATE POLICY "Admins can view profiles in their tenant"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can update profiles in their tenant"
ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND tenant_id = public.get_user_tenant_id(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can delete profiles in their tenant"
ON public.profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6. prevent users from changing their own email (super-admin escalation)
CREATE OR REPLACE FUNCTION public.prevent_approval_field_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.user_id = auth.uid() THEN
    NEW.is_approved := OLD.is_approved;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.approval_requested_at := OLD.approval_requested_at;
    NEW.tenant_id := OLD.tenant_id;
    NEW.email := OLD.email;
  ELSE
    -- admins may not rewrite another user's email either
    NEW.email := OLD.email;
  END IF;

  RETURN NEW;
END;
$function$;

-- 7. tenants: scope admin write access to own tenant
DROP POLICY IF EXISTS "Admins can update all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Admins can delete tenants" ON public.tenants;

CREATE POLICY "Admins can delete own tenant"
ON public.tenants FOR DELETE TO authenticated
USING (id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can delete tenants"
ON public.tenants FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 8. lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.get_user_tenant_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_approval_field_modification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
