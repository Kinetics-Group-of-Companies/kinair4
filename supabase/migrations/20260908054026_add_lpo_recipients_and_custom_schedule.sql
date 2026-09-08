create table if not exists public.lpo_email_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  tenant_id uuid references public.tenants(id) on delete cascade,
  all_tenants boolean not null default false,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lpo_email_recipients_email_check check (position('@' in email) > 1),
  constraint lpo_email_recipients_scope_check check (all_tenants or tenant_id is not null)
);

create unique index if not exists lpo_email_recipients_email_unique
on public.lpo_email_recipients (lower(email));

alter table public.lpo_email_recipients enable row level security;
revoke all on table public.lpo_email_recipients from anon;
grant select, insert, update, delete on table public.lpo_email_recipients to authenticated;
grant all on table public.lpo_email_recipients to service_role;

create policy "Admins can view permitted LPO email recipients"
on public.lpo_email_recipients for select to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and not all_tenants
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  )
);

create policy "Admins can add permitted LPO email recipients"
on public.lpo_email_recipients for insert to authenticated
with check (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and not all_tenants
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  )
);

create policy "Admins can update permitted LPO email recipients"
on public.lpo_email_recipients for update to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and not all_tenants
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  )
)
with check (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and not all_tenants
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  )
);

create policy "Admins can delete permitted LPO email recipients"
on public.lpo_email_recipients for delete to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and not all_tenants
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  )
);

insert into public.lpo_email_recipients (email, display_name, all_tenants, is_enabled)
values ('deepak@kineticsgroup.ae', 'Deepak', true, true)
on conflict (lower(email)) do update
set is_enabled = true, all_tenants = true, tenant_id = null, updated_at = now();

create table if not exists public.lpo_email_schedule (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  frequency text not null default 'daily' check (frequency in ('daily','weekly')),
  weekday smallint not null default 1 check (weekday between 0 and 6),
  send_time time not null default '06:05',
  timezone text not null default 'Asia/Dubai',
  cron_expression text not null default '5 2 * * *',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.lpo_email_schedule enable row level security;
revoke all on table public.lpo_email_schedule from anon, authenticated;
grant select on table public.lpo_email_schedule to authenticated;
grant all on table public.lpo_email_schedule to service_role;

create policy "Admins can view LPO email schedule"
on public.lpo_email_schedule for select to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

insert into public.lpo_email_schedule (
  id, enabled, frequency, weekday, send_time, timezone, cron_expression
)
values (1, true, 'daily', 1, '06:05', 'Asia/Dubai', '5 2 * * *')
on conflict (id) do nothing;

create or replace function public.update_lpo_email_schedule(
  p_enabled boolean,
  p_frequency text,
  p_weekday smallint,
  p_send_time time,
  p_timezone text
)
returns public.lpo_email_schedule
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  target_date date;
  utc_target timestamptz;
  cron_value text;
  job_id bigint;
  result public.lpo_email_schedule;
begin
  if caller_id is null or not (
    public.is_super_admin(caller_id)
    or public.has_role(caller_id, 'admin'::public.app_role)
  ) then
    raise exception 'Administrator access required';
  end if;

  if p_frequency not in ('daily', 'weekly') then
    raise exception 'Frequency must be daily or weekly';
  end if;
  if p_weekday < 0 or p_weekday > 6 then
    raise exception 'Weekday must be between 0 and 6';
  end if;
  perform 1 from pg_catalog.pg_timezone_names where name = p_timezone;
  if not found then
    raise exception 'Unknown timezone';
  end if;

  target_date := current_date
    + mod(p_weekday - extract(dow from current_date)::integer + 7, 7);
  utc_target := (target_date + p_send_time) at time zone p_timezone;

  if p_frequency = 'weekly' then
    cron_value := format(
      '%s %s * * %s',
      extract(minute from utc_target at time zone 'UTC')::integer,
      extract(hour from utc_target at time zone 'UTC')::integer,
      extract(dow from utc_target at time zone 'UTC')::integer
    );
  else
    cron_value := format(
      '%s %s * * *',
      extract(minute from utc_target at time zone 'UTC')::integer,
      extract(hour from utc_target at time zone 'UTC')::integer
    );
  end if;

  select jobid into job_id
  from cron.job
  where jobname = 'kinair-lpo-daily-deepak-summary'
  limit 1;

  if job_id is null then
    raise exception 'LPO summary cron job is missing';
  end if;

  perform cron.alter_job(job_id := job_id, schedule := cron_value, active := p_enabled);

  insert into public.lpo_email_schedule (
    id, enabled, frequency, weekday, send_time, timezone,
    cron_expression, updated_at, updated_by
  )
  values (
    1, p_enabled, p_frequency, p_weekday, p_send_time, p_timezone,
    cron_value, now(), caller_id
  )
  on conflict (id) do update set
    enabled = excluded.enabled,
    frequency = excluded.frequency,
    weekday = excluded.weekday,
    send_time = excluded.send_time,
    timezone = excluded.timezone,
    cron_expression = excluded.cron_expression,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
  returning * into result;

  return result;
end;
$$;

revoke all on function public.update_lpo_email_schedule(boolean, text, smallint, time, text) from public;
grant execute on function public.update_lpo_email_schedule(boolean, text, smallint, time, text) to authenticated;

update public.user_lpo_permissions permission
set can_access_lpo = false, updated_at = now()
where not public.is_super_admin(permission.user_id);
