-- Create storage bucket for project datasheets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-datasheets', 'project-datasheets', true, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their project folders
CREATE POLICY "Users can upload datasheets to their projects"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-datasheets' 
  AND auth.uid() IS NOT NULL
);

-- Allow public read access to datasheets
CREATE POLICY "Anyone can view project datasheets"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-datasheets');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete their datasheets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-datasheets'
  AND auth.uid() IS NOT NULL
);