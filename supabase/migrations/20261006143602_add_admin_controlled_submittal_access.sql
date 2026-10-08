-- Admin-controlled Submittal Control access, merged with the existing LPO permission system.
-- Existing approved users retain Submittal Control access. New users start with access off.

alter table public.user_lpo_permissions
  add column if not exists can_access_submittal boolean not null default false;

update public.user_lpo_permissions permission
set can_access_submittal = true
where exists (
  select 1 from public.profiles profile
  where profile.user_id = permission.user_id
    and profile.is_approved = true
);

insert into public.user_lpo_permissions (
  user_id, can_access_lpo, receive_lpo_emails, notification_email, can_access_submittal
)
select profile.user_id, false, false, profile.email, true
from public.profiles profile
where profile.is_approved = true
  and exists (select 1 from auth.users u where u.id = profile.user_id)
on conflict (user_id) do nothing;

create or replace function public.can_access_submittal(_user_id uuid)
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
        and permission.can_access_submittal
        and coalesce(profile.is_approved, false)
    )
$$;

revoke all on function public.can_access_submittal(uuid) from public;
grant execute on function public.can_access_submittal(uuid) to authenticated, service_role;

create or replace function public.admin_set_portal_permission(
  _target_user_id uuid,
  _can_access_lpo boolean default null,
  _can_access_submittal boolean default null,
  _receive_lpo_emails boolean default null,
  _notification_email text default null
)
returns public.user_lpo_permissions
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  _caller uuid := auth.uid();
  _resolved uuid := _target_user_id;
  _email text;
  _result public.user_lpo_permissions;
begin
  if _caller is null or not (
    public.has_role(_caller,'admin'::public.app_role) or private.is_super_admin(_caller)
  ) then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  if not exists(select 1 from auth.users where id=_resolved) then
    select lower(trim(email)) into _email from public.profiles where user_id=_target_user_id;
    if _email is not null then
      select id into _resolved from auth.users
      where lower(email)=_email order by created_at desc limit 1;
    end if;
  end if;

  if _resolved is null or not exists(select 1 from auth.users where id=_resolved) then
    raise exception 'This approved profile has no active login account. Ask the user to sign up/login again first.' using errcode='23503';
  end if;

  insert into public.user_lpo_permissions(
    user_id, can_access_lpo, can_access_submittal, receive_lpo_emails,
    notification_email, updated_at, updated_by
  )
  values(
    _resolved,
    coalesce(_can_access_lpo,false),
    coalesce(_can_access_submittal,false),
    coalesce(_receive_lpo_emails,false),
    coalesce(nullif(trim(_notification_email),''),(select email from auth.users where id=_resolved)),
    now(),_caller
  )
  on conflict(user_id) do update set
    can_access_lpo=coalesce(_can_access_lpo,user_lpo_permissions.can_access_lpo),
    can_access_submittal=coalesce(_can_access_submittal,user_lpo_permissions.can_access_submittal),
    receive_lpo_emails=coalesce(_receive_lpo_emails,user_lpo_permissions.receive_lpo_emails),
    notification_email=case
      when _notification_email is null then user_lpo_permissions.notification_email
      else nullif(trim(_notification_email),'')
    end,
    updated_at=now(),
    updated_by=_caller
  returning * into _result;

  if _resolved <> _target_user_id then
    update public.profiles current_p set
      is_approved=true,
      approved_at=coalesce(current_p.approved_at,now())
    where current_p.user_id=_resolved;
  end if;

  return _result;
end
$$;

revoke all on function public.admin_set_portal_permission(uuid,boolean,boolean,boolean,text) from public;
grant execute on function public.admin_set_portal_permission(uuid,boolean,boolean,boolean,text) to authenticated, service_role;

create or replace function private.initialize_lpo_permissions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
begin
  insert into public.user_lpo_permissions (
    user_id, can_access_lpo, can_access_submittal, receive_lpo_emails, notification_email
  )
  values (new.user_id, false, false, false, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

do $$
declare
  p record;
  using_expr text;
  check_expr text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname='public'
      and tablename like 'submittal\_%' escape '\'
  loop
    using_expr := '(' || coalesce(p.qual,'true') || ') and public.can_access_submittal((select auth.uid()))';
    check_expr := '(' || coalesce(p.with_check,p.qual,'true') || ') and public.can_access_submittal((select auth.uid()))';

    if p.cmd in ('SELECT','DELETE') then
      execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,using_expr);
    elsif p.cmd='INSERT' then
      execute format('alter policy %I on %I.%I with check (%s)',p.policyname,p.schemaname,p.tablename,check_expr);
    elsif p.cmd in ('UPDATE','ALL') then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',p.policyname,p.schemaname,p.tablename,using_expr,check_expr);
    end if;
  end loop;
end
$$;

alter policy "tenant members read submittal files"
on storage.objects
using (
  bucket_id = 'submittal-control'
  and public.can_access_submittal((select auth.uid()))
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text from public.profiles
    where profiles.user_id=(select auth.uid()) and profiles.is_approved=true
  )
);

alter policy "tenant members upload submittal files"
on storage.objects
with check (
  bucket_id = 'submittal-control'
  and public.can_access_submittal((select auth.uid()))
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text from public.profiles
    where profiles.user_id=(select auth.uid()) and profiles.is_approved=true
  )
);

alter policy "tenant members update submittal files"
on storage.objects
using (
  bucket_id = 'submittal-control'
  and public.can_access_submittal((select auth.uid()))
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text from public.profiles
    where profiles.user_id=(select auth.uid()) and profiles.is_approved=true
  )
)
with check (
  bucket_id = 'submittal-control'
  and public.can_access_submittal((select auth.uid()))
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text from public.profiles
    where profiles.user_id=(select auth.uid()) and profiles.is_approved=true
  )
);

alter policy "tenant members delete submittal files"
on storage.objects
using (
  bucket_id = 'submittal-control'
  and public.can_access_submittal((select auth.uid()))
  and (storage.foldername(name))[1] in (
    select profiles.tenant_id::text from public.profiles
    where profiles.user_id=(select auth.uid()) and profiles.is_approved=true
  )
);
