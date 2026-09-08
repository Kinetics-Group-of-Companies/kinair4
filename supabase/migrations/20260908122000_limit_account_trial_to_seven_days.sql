create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.tenants (name, email, is_active, subscription_start, subscription_end)
  values (
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email,
    true,
    now(),
    now() + interval '7 days'
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

update public.tenants as t
set subscription_end = t.subscription_start + interval '7 days'
where t.subscription_start is not null
  and t.subscription_end is distinct from t.subscription_start + interval '7 days'
  and exists (
    select 1
    from public.profiles p
    where p.tenant_id = t.id
      and p.is_approved = false
  )
  and not exists (
    select 1
    from public.profiles p
    where p.tenant_id = t.id
      and p.is_approved = true
  );
