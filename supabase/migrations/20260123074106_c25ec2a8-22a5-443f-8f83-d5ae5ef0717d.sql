-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Super admins can update all tenants" ON public.tenants;

-- Recreate as PERMISSIVE (which is the default)
CREATE POLICY "Super admins can update all tenants" 
ON public.tenants 
FOR UPDATE 
USING (is_super_admin(auth.uid()));