-- Drop the existing restrictive policies that conflict
DROP POLICY IF EXISTS "All users can view default tenant branding" ON tenants;
DROP POLICY IF EXISTS "Public can view tenant branding" ON tenants;
DROP POLICY IF EXISTS "Only authenticated users can access tenants" ON tenants;

-- Create a PERMISSIVE policy that allows everyone to view the default tenant
-- This ensures brand data is visible to all users regardless of their tenant_id
CREATE POLICY "Anyone can view default tenant for branding"
ON tenants
FOR SELECT
TO public
USING (id = '00000000-0000-0000-0000-000000000001'::uuid);