-- Allow public access to tenant branding information (name, logo, favicon)
-- This is necessary for public pages to display correct branding without login

CREATE POLICY "Public can view tenant branding" 
ON public.tenants 
FOR SELECT 
TO anon
USING (true);