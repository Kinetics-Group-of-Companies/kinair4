-- Admin-managed LPO tracker access and email subscriptions.

create table if not exists public.user_lpo_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_access_lpo boolean not null default false,
  receive_lpo_emails boolean not null default false,
  notification_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint user_lpo_permissions_notification_email_check
    check (notification_email is null or position('@' in notification_email) > 1)
);

alter table public.user_lpo_permissions enable row level security;
revoke all on table public.user_lpo_permissions from anon;
grant select, insert, update, delete on table public.user_lpo_permissions to authenticated;
grant all on table public.user_lpo_permissions to service_role;

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

create or replace function private.initialize_lpo_permissions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
begin
  insert into public.user_lpo_permissions (user_id, notification_email)
  values (new.user_id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_lpo_permissions_after_profile_insert on public.profiles;
create trigger initialize_lpo_permissions_after_profile_insert
after insert on public.profiles
for each row execute function private.initialize_lpo_permissions();

insert into public.user_lpo_permissions (
  user_id, can_access_lpo, receive_lpo_emails, notification_email
)
select profile.user_id,
       coalesce(profile.is_approved, false),
       lower(auth_user.email) = 'chndeepak7@gmail.com',
       case when lower(auth_user.email) = 'chndeepak7@gmail.com'
         then 'deepak@kineticsgroup.ae' else profile.email end
from public.profiles profile
join auth.users auth_user on auth_user.id = profile.user_id
on conflict (user_id) do nothing;

drop policy if exists "Users can view own LPO permissions" on public.user_lpo_permissions;
create policy "Users can view own LPO permissions"
on public.user_lpo_permissions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can manage tenant LPO permissions" on public.user_lpo_permissions;
create policy "Admins can manage tenant LPO permissions"
on public.user_lpo_permissions for all to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and exists (
      select 1 from public.profiles target
      where target.user_id = user_lpo_permissions.user_id
        and target.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
)
with check (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and exists (
      select 1 from public.profiles target
      where target.user_id = user_lpo_permissions.user_id
        and target.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
);

-- Replace legacy LPO policies with permission-aware policies.
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
      'create policy "Permitted tenant LPO access" on public.%I for all to authenticated
       using (
         public.can_access_lpo((select auth.uid()))
         and (tenant_id = public.get_user_tenant_id((select auth.uid()))
              or public.is_super_admin((select auth.uid())))
       )
       with check (
         public.can_access_lpo((select auth.uid()))
         and (tenant_id = public.get_user_tenant_id((select auth.uid()))
              or public.is_super_admin((select auth.uid())))
       )',
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
    where schemaname = 'public' and tablename = 'lpo_alert_log'
  loop
    execute format('drop policy if exists %I on public.lpo_alert_log', old_policy);
  end loop;
end
$$;

create policy "Permitted tenant users can add alert log"
on public.lpo_alert_log for insert to authenticated
with check (
  public.can_access_lpo((select auth.uid()))
  and (tenant_id = public.get_user_tenant_id((select auth.uid()))
       or public.is_super_admin((select auth.uid())))
);
create policy "Permitted tenant users can view alert log"
on public.lpo_alert_log for select to authenticated
using (
  public.can_access_lpo((select auth.uid()))
  and (tenant_id = public.get_user_tenant_id((select auth.uid()))
       or public.is_super_admin((select auth.uid())))
);

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

create policy "Permitted tenant users can create LPO orders"
on public.lpo_orders for insert to authenticated
with check (
  public.can_access_lpo((select auth.uid()))
  and tenant_id = public.get_user_tenant_id((select auth.uid()))
  and user_id = (select auth.uid())
);
create policy "Permitted tenant users can view LPO orders"
on public.lpo_orders for select to authenticated
using (
  public.can_access_lpo((select auth.uid()))
  and (tenant_id = public.get_user_tenant_id((select auth.uid()))
       or public.is_super_admin((select auth.uid())))
);
create policy "Permitted tenant users can update LPO orders"
on public.lpo_orders for update to authenticated
using (
  public.can_access_lpo((select auth.uid()))
  and (tenant_id = public.get_user_tenant_id((select auth.uid()))
       or public.is_super_admin((select auth.uid())))
)
with check (
  public.can_access_lpo((select auth.uid()))
  and (tenant_id = public.get_user_tenant_id((select auth.uid()))
       or public.is_super_admin((select auth.uid())))
);
create policy "Permitted admins can delete LPO orders"
on public.lpo_orders for delete to authenticated
using (
  public.can_access_lpo((select auth.uid()))
  and (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
     and public.has_role((select auth.uid()), 'admin'::public.app_role))
    or public.is_super_admin((select auth.uid()))
  )
);

drop policy if exists "migrated_private_buckets_access" on storage.objects;
create policy "migrated_private_buckets_access"
on storage.objects for all to authenticated
using (bucket_id = any (array['project-datasheets','software-releases','air-curtain-assets']))
with check (bucket_id = any (array['project-datasheets','software-releases','air-curtain-assets']));

do $$
declare old_policy text;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname ilike '%LPO document%'
  loop
    execute format('drop policy if exists %I on storage.objects', old_policy);
  end loop;
end
$$;

create policy "Permitted tenant LPO document access"
on storage.objects for all to authenticated
using (
  bucket_id = 'lpo-documents'
  and public.can_access_lpo((select auth.uid()))
  and ((storage.foldername(name))[1] = public.get_user_tenant_id((select auth.uid()))::text
       or public.is_super_admin((select auth.uid())))
)
with check (
  bucket_id = 'lpo-documents'
  and public.can_access_lpo((select auth.uid()))
  and ((storage.foldername(name))[1] = public.get_user_tenant_id((select auth.uid()))::text
       or public.is_super_admin((select auth.uid())))
);
