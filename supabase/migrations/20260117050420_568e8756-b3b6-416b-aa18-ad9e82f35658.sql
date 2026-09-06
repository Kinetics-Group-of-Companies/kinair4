-- Add policy to allow all users (authenticated and anonymous) to view the default tenant for branding
CREATE POLICY "Public can view default tenant branding"
ON public.tenants
FOR SELECT
TO public
USING (id = '00000000-0000-0000-0000-000000000001'::uuid);