drop policy if exists "Admins can update guest trial duration"
on public.guest_trial_settings;

create policy "Admins can update guest trial duration"
on public.guest_trial_settings for update
to authenticated
using (
  (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) = false
  and (
    public.has_role((select auth.uid()), 'admin')
    or (select lower(coalesce(auth.jwt()->>'email', ''))) in (
      'chndeepak7@gmail.com',
      'deepak@kineticsgroup.ae'
    )
  )
)
with check (
  id = true
  and duration_minutes between 1 and 60
  and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) = false
  and (
    public.has_role((select auth.uid()), 'admin')
    or (select lower(coalesce(auth.jwt()->>'email', ''))) in (
      'chndeepak7@gmail.com',
      'deepak@kineticsgroup.ae'
    )
  )
);
