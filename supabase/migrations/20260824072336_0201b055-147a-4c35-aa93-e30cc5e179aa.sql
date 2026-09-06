
CREATE TABLE public.software_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  platform text NOT NULL DEFAULT 'Windows x64',
  title text NOT NULL,
  notes text,
  storage_path text NOT NULL,
  file_size_bytes bigint,
  is_latest boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.software_releases TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.software_releases TO authenticated;
GRANT ALL ON public.software_releases TO service_role;

ALTER TABLE public.software_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view releases"
ON public.software_releases FOR SELECT
USING (true);

CREATE POLICY "Super admins manage releases"
ON public.software_releases FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Anyone can read software release files"
ON storage.objects FOR SELECT
USING (bucket_id = 'software-releases');

INSERT INTO public.software_releases (version, title, notes, storage_path, file_size_bytes, is_latest)
VALUES ('v11', 'KINAIR Fan Selector - Offline Desktop', 'Full offline catalogue, offline login after first online sign-in, automatic cloud sync when connected.', 'KINAIR-Fan-Selector-Offline-v11-windows-x64.zip', 357610925, true);
