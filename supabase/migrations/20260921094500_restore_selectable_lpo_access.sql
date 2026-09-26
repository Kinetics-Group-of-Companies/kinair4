-- Restore admin-selectable LPO Tracker access while keeping the tracker shared.
-- Users with can_access_lpo=true see the same company-wide LPO register.

create or replace function public.can_access_lpo(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog
as $$
  select private.is_super_admin(_user_id)
    or exists (
      select 1
      from public.user_lpo_permissions permission
      join public.profiles profile on profile.user_id = permission.user_id
      where permission.user_id = _user_id
        and permission.can_access_lpo
        and coalesce(profile.is_approved, false)
    )
$$;

revoke all on function public.can_access_lpo(uuid) from public;
grant execute on function public.can_access_lpo(uuid) to authenticated, service_role;

-- New users start with Tracker access off; admin selects access from the portal.
create or replace function private.initialize_lpo_permissions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
begin
  insert into public.user_lpo_permissions (
    user_id, can_access_lpo, receive_lpo_emails, notification_email
  )
  values (new.user_id, false, false, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
