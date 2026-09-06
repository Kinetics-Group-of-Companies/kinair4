DROP POLICY IF EXISTS "Project members can view datasheets" ON storage.objects;
DROP POLICY IF EXISTS "Project members can upload datasheets" ON storage.objects;
DROP POLICY IF EXISTS "Project members can delete datasheets" ON storage.objects;

CREATE POLICY "Project owners and admins can view datasheets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-datasheets'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND (
        p.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_super_admin(auth.uid())
      )
  )
);

CREATE POLICY "Project owners and admins can upload datasheets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-datasheets'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND (
        p.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_super_admin(auth.uid())
      )
  )
);

CREATE POLICY "Project owners and admins can delete datasheets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-datasheets'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[2]
      AND (
        p.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_super_admin(auth.uid())
      )
  )
);