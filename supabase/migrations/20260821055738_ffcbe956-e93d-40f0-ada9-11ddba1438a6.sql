
-- page_content: remove blanket public read
DROP POLICY IF EXISTS "Anyone can view page content" ON public.page_content;
DROP POLICY IF EXISTS "Users can view their tenant page content" ON public.page_content;
CREATE POLICY "Users can view their tenant page content"
  ON public.page_content FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- documentation_sections: remove blanket public read
DROP POLICY IF EXISTS "Documentation is readable by all" ON public.documentation_sections;
DROP POLICY IF EXISTS "Users can view their tenant documentation" ON public.documentation_sections;
CREATE POLICY "Users can view their tenant documentation"
  ON public.documentation_sections FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- project_items: remove tenant-wide read of pricing
DROP POLICY IF EXISTS "Users can view project items for their tenant" ON public.project_items;

-- projects: scope write policies to authenticated role only
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert projects for their tenant" ON public.projects;
CREATE POLICY "Users can insert projects for their tenant"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND user_id = auth.uid());

-- profiles: scope super admin policies to authenticated role
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.profiles;
CREATE POLICY "Super admins can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- tenants: remove duplicate/overbroad read policies
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Admins can view all tenants" ON public.tenants;
CREATE POLICY "Admins can view their own tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Super admins can view all tenants" ON public.tenants;
CREATE POLICY "Super admins can view all tenants"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "Super admins can update all tenants" ON public.tenants;
CREATE POLICY "Super admins can update all tenants"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()));
