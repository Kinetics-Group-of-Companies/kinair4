-- Make the LPO tracker a shared company register for all approved authenticated users.
-- Creator/user_id remains for audit only; it no longer controls visibility.

create or replace function public.can_access_lpo(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog
as $$
  select private.is_super_admin(_user_id)
    or exists (
      select 1
      from public.profiles profile
      where profile.user_id = _user_id
        and coalesce(profile.is_approved, false)
    )
$$;

revoke all on function public.can_access_lpo(uuid) from public;
grant execute on function public.can_access_lpo(uuid) to authenticated, service_role;

-- Existing approved users automatically receive LPO access.
insert into public.user_lpo_permissions (
  user_id, can_access_lpo, receive_lpo_emails, notification_email
)
select profile.user_id, true, false, profile.email
from public.profiles profile
where coalesce(profile.is_approved, false)
on conflict (user_id) do update
set can_access_lpo = true,
    updated_at = now();

-- New profiles get access automatically once approved; can_access_lpo() also
-- checks profile approval directly so no per-user visibility filter is required.
create or replace function private.initialize_lpo_permissions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
begin
  insert into public.user_lpo_permissions (
    user_id, can_access_lpo, notification_email
  )
  values (new.user_id, coalesce(new.is_approved, false), new.email)
  on conflict (user_id) do update
  set can_access_lpo = coalesce(new.is_approved, false),
      notification_email = coalesce(public.user_lpo_permissions.notification_email, new.email),
      updated_at = now();
  return new;
end;
$$;

-- Replace LPO data policies: every approved authenticated user sees the same
-- company-wide LPO records, contacts, documents, revisions and updates.
do $$
declare
  table_name text;
  old_policy text;
begin
  foreach table_name in array array[
    'lpo_contacts', 'lpo_documents', 'lpo_order_updates', 'lpo_revisions'
  ]
  loop
    for old_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', old_policy, table_name);
    end loop;

    execute format(
      'create policy "Shared company LPO access" on public.%I for all to authenticated
       using (public.can_access_lpo((select auth.uid())))
       with check (public.can_access_lpo((select auth.uid())))',
      table_name
    );
  end loop;
end
$$;

do $$
declare old_policy text;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'lpo_orders'
  loop
    execute format('drop policy if exists %I on public.lpo_orders', old_policy);
  end loop;
end
$$;

create policy "Shared company users can create LPO orders"
on public.lpo_orders for insert to authenticated
with check (
  public.can_access_lpo((select auth.uid()))
  and user_id = (select auth.uid())
);

create policy "Shared company users can view LPO orders"
on public.lpo_orders for select to authenticated
using (public.can_access_lpo((select auth.uid())));

create policy "Shared company users can update LPO orders"
on public.lpo_orders for update to authenticated
using (public.can_access_lpo((select auth.uid())))
with check (public.can_access_lpo((select auth.uid())));

create policy "Shared company admins can delete LPO orders"
on public.lpo_orders for delete to authenticated
using (
  public.can_access_lpo((select auth.uid()))
  and (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.is_super_admin((select auth.uid()))
  )
);

-- Alert log is shared too.
do $$
declare old_policy text;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'lpo_alert_log'
  loop
    execute format('drop policy if exists %I on public.lpo_alert_log', old_policy);
  end loop;
end
$$;

create policy "Shared company users can add LPO alert log"
on public.lpo_alert_log for insert to authenticated
with check (public.can_access_lpo((select auth.uid())));

create policy "Shared company users can view LPO alert log"
on public.lpo_alert_log for select to authenticated
using (public.can_access_lpo((select auth.uid())));

-- LPO files are shared across approved company users regardless of uploader folder.
do $$
declare old_policy text;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (policyname ilike '%LPO document%' or policyname = 'Permitted tenant LPO document access')
  loop
    execute format('drop policy if exists %I on storage.objects', old_policy);
  end loop;
end
$$;

create policy "Shared company LPO document access"
on storage.objects for all to authenticated
using (
  bucket_id = 'lpo-documents'
  and public.can_access_lpo((select auth.uid()))
)
with check (
  bucket_id = 'lpo-documents'
  and public.can_access_lpo((select auth.uid()))
);
