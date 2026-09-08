create table public.guest_trial_settings (
  id boolean primary key default true check (id),
  duration_minutes smallint not null default 5
    check (duration_minutes between 1 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.guest_trial_settings (id, duration_minutes)
values (true, 5)
on conflict (id) do nothing;

alter table public.guest_trial_settings enable row level security;

revoke all on table public.guest_trial_settings from anon, authenticated;
grant select on table public.guest_trial_settings to anon, authenticated;
grant update on table public.guest_trial_settings to authenticated;
grant all on table public.guest_trial_settings to service_role;

create policy "Anyone can read guest trial duration"
on public.guest_trial_settings for select
to anon, authenticated
using (true);

create policy "Admins can update guest trial duration"
on public.guest_trial_settings for update
to authenticated
using (
  coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and (
    public.has_role((select auth.uid()), 'admin')
    or lower(coalesce((select auth.jwt()->>'email'), '')) in (
      'chndeepak7@gmail.com',
      'deepak@kineticsgroup.ae'
    )
  )
)
with check (
  id = true
  and duration_minutes between 1 and 60
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  and (
    public.has_role((select auth.uid()), 'admin')
    or lower(coalesce((select auth.jwt()->>'email'), '')) in (
      'chndeepak7@gmail.com',
      'deepak@kineticsgroup.ae'
    )
  )
);

create index guest_trial_settings_updated_by_idx
  on public.guest_trial_settings (updated_by);

alter table public.guest_trials
  drop constraint if exists guest_trials_five_minute_limit,
  add constraint guest_trials_duration_limit
    check (expires_at <= started_at + interval '60 minutes');
