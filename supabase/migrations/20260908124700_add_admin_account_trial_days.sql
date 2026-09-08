alter table public.guest_trial_settings
  add column account_trial_days smallint not null default 7
    check (account_trial_days between 1 and 30);

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
  and account_trial_days between 1 and 30
  and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) = false
  and (
    public.has_role((select auth.uid()), 'admin')
    or (select lower(coalesce(auth.jwt()->>'email', ''))) in (
      'chndeepak7@gmail.com',
      'deepak@kineticsgroup.ae'
    )
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  trial_days smallint;
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  select account_trial_days
  into trial_days
  from public.guest_trial_settings
  where id = true;

  trial_days := greatest(1, least(30, coalesce(trial_days, 7)));

  insert into public.tenants (name, email, is_active, subscription_start, subscription_end)
  values (
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email,
    true,
    now(),
    now() + (trial_days * interval '1 day')
  )
  returning id into new_tenant_id;

  insert into public.profiles (
    user_id, tenant_id, display_name, email, is_approved, approval_requested_at
  )
  values (
    new.id,
    new_tenant_id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email,
    false,
    now()
  );

  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;
