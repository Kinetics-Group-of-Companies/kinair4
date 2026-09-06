-- 1. documentation_sections: require admin role for modifications
DROP POLICY IF EXISTS "Admins can manage their documentation" ON public.documentation_sections;
CREATE POLICY "Admins can manage their documentation"
ON public.documentation_sections
FOR ALL
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid()))
)
WITH CHECK (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid()))
);

-- 2. software-releases storage: downloads require a signed-in user
DROP POLICY IF EXISTS "Anyone can read software release files" ON storage.objects;
CREATE POLICY "Signed-in users can read software release files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'software-releases');