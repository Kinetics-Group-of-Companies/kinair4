create table if not exists public.account_daily_trials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trial_day date not null default ((now() at time zone 'Asia/Dubai')::date),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint account_daily_trials_user_day_key unique (user_id, trial_day),
  constraint account_daily_trials_max_duration
    check (expires_at > started_at and expires_at <= started_at + interval '60 minutes')
);

create index if not exists account_daily_trials_user_day_idx
  on public.account_daily_trials (user_id, trial_day);

alter table public.account_daily_trials enable row level security;
revoke all on table public.account_daily_trials from anon, authenticated;
grant select on table public.account_daily_trials to authenticated;
grant all on table public.account_daily_trials to service_role;

drop policy if exists "Account trial user can view own daily usage"
  on public.account_daily_trials;
create policy "Account trial user can view own daily usage"
  on public.account_daily_trials for select
  to authenticated
  using ((select auth.uid()) = user_id);
