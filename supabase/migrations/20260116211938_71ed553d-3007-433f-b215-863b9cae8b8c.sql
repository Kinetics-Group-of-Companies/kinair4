-- Add RLS policy for page_content to allow all authenticated users to view default tenant content
DROP POLICY IF EXISTS "All users can view default tenant page content" ON public.page_content;
CREATE POLICY "All users can view default tenant page content" 
ON public.page_content FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Add RLS policy for documentation_sections to allow all users to view default tenant docs
DROP POLICY IF EXISTS "All users can view default tenant documentation" ON public.documentation_sections;
CREATE POLICY "All users can view default tenant documentation" 
ON public.documentation_sections FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001');