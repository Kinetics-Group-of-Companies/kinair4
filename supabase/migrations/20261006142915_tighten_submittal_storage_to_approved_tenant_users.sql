
alter policy "tenant members read submittal files"
on storage.objects
using (
  bucket_id = 'submittal-control'
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.is_approved = true
  )
);

alter policy "tenant members upload submittal files"
on storage.objects
with check (
  bucket_id = 'submittal-control'
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.is_approved = true
  )
);

alter policy "tenant members update submittal files"
on storage.objects
using (
  bucket_id = 'submittal-control'
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.is_approved = true
  )
)
with check (
  bucket_id = 'submittal-control'
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.is_approved = true
  )
);

alter policy "tenant members delete submittal files"
on storage.objects
using (
  bucket_id = 'submittal-control'
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text
    from public.profiles
    where profiles.user_id = (select auth.uid())
      and profiles.is_approved = true
  )
);
