create table public.guest_trials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  ip_hash text not null unique,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint guest_trials_five_minute_limit
    check (expires_at <= started_at + interval '5 minutes')
);

alter table public.guest_trials enable row level security;
revoke all on table public.guest_trials from anon, authenticated;
grant select on table public.guest_trials to authenticated;
grant all on table public.guest_trials to service_role;

create policy "Guest can view own trial"
on public.guest_trials for select to authenticated
using ((select auth.uid()) = user_id);

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
    now() + interval '30 days'
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

do $$
declare
  table_name text;
  policy_prefix text;
begin
  foreach table_name in array array[
    'blade_configurations',
    'datasheet_config',
    'fan_dimensions',
    'noise_data',
    'performance_data',
    'series_dimension_schema',
    'series_dimension_values',
    'software_releases'
  ]
  loop
    policy_prefix := 'block_guest_write_' || table_name;

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (coalesce((select (auth.jwt()->>''is_anonymous'')::boolean), false) = false)',
      policy_prefix || '_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (coalesce((select (auth.jwt()->>''is_anonymous'')::boolean), false) = false) with check (coalesce((select (auth.jwt()->>''is_anonymous'')::boolean), false) = false)',
      policy_prefix || '_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (coalesce((select (auth.jwt()->>''is_anonymous'')::boolean), false) = false)',
      policy_prefix || '_delete',
      table_name
    );
  end loop;
end;
$$;
