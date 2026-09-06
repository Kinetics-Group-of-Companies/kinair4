-- Allow all authenticated users to view the default tenant branding
-- This ensures all users see the main brand (logo, name, favicon) regardless of their tenant

CREATE POLICY "All users can view default tenant branding" 
ON public.tenants 
FOR SELECT 
TO authenticated
USING (id = '00000000-0000-0000-0000-000000000001');

-- Also ensure motor_brands from default tenant are visible to all authenticated users
-- (for fan selection motor brand dropdown)
CREATE POLICY "All users can view default tenant motor brands" 
ON public.motor_brands 
FOR SELECT 
TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001');