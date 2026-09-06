CREATE POLICY "Super admins upload release files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'software-releases' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update release files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'software-releases' AND public.is_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'software-releases' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins delete release files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'software-releases' AND public.is_super_admin(auth.uid()));