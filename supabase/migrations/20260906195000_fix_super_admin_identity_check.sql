-- Authorize super admins from the authenticated identity source.
-- The previous implementation depended on a matching public.profiles row,
-- which can be missing or linked to a stale user_id.
--
-- Keep the privileged auth.users lookup outside the exposed API schema.
-- The public helper remains the stable function used by existing RLS policies.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

create or replace function private.is_super_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select _user_id = auth.uid()
    and exists (
      select 1
      from auth.users
      where id = _user_id
        and lower(email) = any (
          array['chndeepak7@gmail.com', 'deepak@kineticsgroup.ae']::text[]
        )
    )
$$;

revoke all on function private.is_super_admin(uuid) from public;
revoke all on function private.is_super_admin(uuid) from anon;
grant execute on function private.is_super_admin(uuid) to authenticated;
grant execute on function private.is_super_admin(uuid) to service_role;

create or replace function public.is_super_admin(_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select private.is_super_admin(_user_id)
$$;

revoke all on function public.is_super_admin(uuid) from public;
revoke all on function public.is_super_admin(uuid) from anon;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.is_super_admin(uuid) to service_role;
