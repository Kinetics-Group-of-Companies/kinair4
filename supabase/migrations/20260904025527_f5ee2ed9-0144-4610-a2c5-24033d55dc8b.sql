
-- Scope tenant-based description policies to signed-in users only (anon errored on helper function)
ALTER POLICY "Users can view accessory descriptions for their tenant" ON public.accessory_descriptions TO authenticated;
ALTER POLICY "Admins can insert accessory descriptions" ON public.accessory_descriptions TO authenticated;
ALTER POLICY "Admins can update accessory descriptions" ON public.accessory_descriptions TO authenticated;
ALTER POLICY "Admins can delete accessory descriptions" ON public.accessory_descriptions TO authenticated;

ALTER POLICY "Users can view fire rating descriptions for their tenant" ON public.fire_rating_descriptions TO authenticated;
ALTER POLICY "Admins can insert fire rating descriptions" ON public.fire_rating_descriptions TO authenticated;
ALTER POLICY "Admins can update fire rating descriptions" ON public.fire_rating_descriptions TO authenticated;
ALTER POLICY "Admins can delete fire rating descriptions" ON public.fire_rating_descriptions TO authenticated;

ALTER POLICY "Users can view atex rating descriptions for their tenant" ON public.atex_rating_descriptions TO authenticated;
ALTER POLICY "Admins can insert atex rating descriptions" ON public.atex_rating_descriptions TO authenticated;
ALTER POLICY "Admins can update atex rating descriptions" ON public.atex_rating_descriptions TO authenticated;
ALTER POLICY "Admins can delete atex rating descriptions" ON public.atex_rating_descriptions TO authenticated;

-- Public downloads: release list readable by everyone
GRANT SELECT ON public.software_releases TO anon;
DROP POLICY IF EXISTS "Authenticated users can view releases" ON public.software_releases;
DROP POLICY IF EXISTS "Anyone can view releases" ON public.software_releases;
CREATE POLICY "Anyone can view releases"
  ON public.software_releases FOR SELECT
  TO anon, authenticated
  USING (true);

-- Public downloads: installer files readable by everyone
DROP POLICY IF EXISTS "Authenticated users can download releases" ON storage.objects;
DROP POLICY IF EXISTS "Public can download releases" ON storage.objects;
CREATE POLICY "Public can download releases"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'software-releases');
