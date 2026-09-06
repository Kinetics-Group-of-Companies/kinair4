-- Authorize super admins from the authenticated identity source.
-- The previous implementation depended on a matching public.profiles row,
-- which can be missing or linked to a stale user_id.

create or replace function public.is_super_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from auth.users
    where id = _user_id
      and lower(email) = any (
        array['chndeepak7@gmail.com', 'deepak@kineticsgroup.ae']::text[]
      )
  )
$$;

revoke all on function public.is_super_admin(uuid) from public;
revoke all on function public.is_super_admin(uuid) from anon;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.is_super_admin(uuid) to service_role;
