-- Run on the NEW company Supabase project after the database restore.
-- Required Vault secret names:
--   kinair_project_url      = https://<NEW_PROJECT_REF>.supabase.co
--   kinair_publishable_key  = target project's publishable/anon key
--   kinair_lpo_cron_secret  = the same cron secret expected by the deployed LPO functions
--
-- Do not put secret values in this file or Git.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  required_name text;
begin
  foreach required_name in array array[
    'kinair_project_url',
    'kinair_publishable_key',
    'kinair_lpo_cron_secret'
  ]
  loop
    if not exists (select 1 from vault.decrypted_secrets where name = required_name) then
      raise exception 'Missing required Vault secret: %', required_name;
    end if;
  end loop;
end
$$;

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'kinair-lpo-daily-delay-alerts',
  'kinair-lpo-daily-deepak-summary'
);

select cron.schedule(
  'kinair-lpo-daily-delay-alerts',
  '0 2 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'kinair_project_url') || '/functions/v1/lpo-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kinair_publishable_key'),
        'x-kinair-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kinair_lpo_cron_secret')
      ),
      body := jsonb_build_object('mode', 'delay'),
      timeout_milliseconds := 30000
    );
  $cron$
);

select cron.schedule(
  'kinair-lpo-daily-deepak-summary',
  '59 3 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'kinair_project_url') || '/functions/v1/lpo-deepak-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kinair_publishable_key'),
        'x-kinair-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kinair_lpo_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
