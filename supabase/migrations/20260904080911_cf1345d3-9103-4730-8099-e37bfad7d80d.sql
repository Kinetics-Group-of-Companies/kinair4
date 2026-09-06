CREATE POLICY "Signed-in users can read LPO documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lpo-documents');
CREATE POLICY "Signed-in users can upload LPO documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lpo-documents');
CREATE POLICY "Signed-in users can update LPO documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lpo-documents');
CREATE POLICY "Signed-in users can delete LPO documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lpo-documents');