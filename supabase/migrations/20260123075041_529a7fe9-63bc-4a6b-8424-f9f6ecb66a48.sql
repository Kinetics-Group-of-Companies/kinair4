-- Drop the restrictive policy that's blocking super admin updates
DROP POLICY IF EXISTS "Admins can update their tenant" ON public.tenants;