do $$
declare
  kinair_tenant_id uuid := '00000000-0000-0000-0000-000000000001';
  admin_user record;
begin
  if not exists (
    select 1 from public.tenants
    where id = kinair_tenant_id and is_active = true
  ) then
    raise exception 'Active KINAIR tenant was not found';
  end if;

  for admin_user in
    select id, email, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1)) as display_name
    from auth.users
    where lower(email) = any (
      array['chndeepak7@gmail.com', 'deepak@kineticsgroup.ae']::text[]
    )
  loop
    update public.profiles
    set tenant_id = kinair_tenant_id,
        email = admin_user.email,
        display_name = coalesce(public.profiles.display_name, admin_user.display_name),
        is_approved = true,
        approved_at = coalesce(public.profiles.approved_at, now()),
        approved_by = coalesce(public.profiles.approved_by, admin_user.id),
        updated_at = now()
    where user_id = admin_user.id;

    if not found then
      insert into public.profiles (
        user_id, tenant_id, display_name, email, is_approved, approved_at, approved_by
      )
      values (
        admin_user.id, kinair_tenant_id, admin_user.display_name,
        admin_user.email, true, now(), admin_user.id
      );
    end if;

    insert into public.user_roles (user_id, role)
    values (admin_user.id, 'admin'::public.app_role)
    on conflict (user_id) do update set role = excluded.role;
  end loop;
end
$$;
