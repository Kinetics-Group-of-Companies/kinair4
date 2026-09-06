-- Drop existing restrictive policies on tenants
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Admins can view all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can view all tenants" ON public.tenants;

-- Create permissive policies for tenant viewing
CREATE POLICY "Users can view their own tenant" 
ON public.tenants 
FOR SELECT 
USING (id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can view all tenants" 
ON public.tenants 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can view all tenants" 
ON public.tenants 
FOR SELECT 
USING (public.is_super_admin(auth.uid()));