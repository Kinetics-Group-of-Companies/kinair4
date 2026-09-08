alter table public.guest_trials
  add column if not exists trial_day date;

update public.guest_trials
set trial_day = (started_at at time zone 'Asia/Dubai')::date
where trial_day is null;

alter table public.guest_trials
  alter column trial_day set default ((now() at time zone 'Asia/Dubai')::date),
  alter column trial_day set not null,
  drop constraint if exists guest_trials_user_id_key,
  drop constraint if exists guest_trials_ip_hash_key;

alter table public.guest_trials
  add constraint guest_trials_ip_day_key unique (ip_hash, trial_day);

create index if not exists guest_trials_user_day_idx
  on public.guest_trials (user_id, trial_day);
