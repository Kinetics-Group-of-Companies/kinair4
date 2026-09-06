-- Drop all RESTRICTIVE SELECT policies on tenants that block access to default tenant
DROP POLICY IF EXISTS "Admins can view their tenant" ON public.tenants;
DROP POLICY IF EXISTS "Only authenticated users can access tenants" ON public.tenants;

-- Ensure all authenticated users can view default tenant for branding (dropping existing and recreating as anon-safe)
DROP POLICY IF EXISTS "Public can view default tenant branding" ON public.tenants;

-- Create policy for anon role (unauthenticated users)
CREATE POLICY "Anon can view default tenant branding"
ON public.tenants
FOR SELECT
TO anon
USING (id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Create policy for authenticated role 
CREATE POLICY "Authenticated can view default tenant branding"
ON public.tenants
FOR SELECT
TO authenticated
USING (id = '00000000-0000-0000-0000-000000000001'::uuid);