create schema if not exists submittal_recovery;
revoke all on schema submittal_recovery from public, anon, authenticated;
create table if not exists submittal_recovery.settings_history (
 id bigint generated always as identity primary key,
 tenant_id uuid not null, data jsonb not null, original_updated_at timestamptz,
 captured_at timestamptz not null default now(), actor_id uuid, reason text not null
);
alter table submittal_recovery.settings_history enable row level security;
revoke all on submittal_recovery.settings_history from public, anon, authenticated;
insert into submittal_recovery.settings_history(tenant_id,data,original_updated_at,reason)
 select tenant_id,data,updated_at,'incident snapshot before protection' from public.submittal_lite_settings;
create or replace function submittal_recovery.protect_settings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null and session_user not in ('postgres','supabase_admin') then
   raise exception 'Authenticated library write required';
 end if;
 if TG_OP='UPDATE' then
   if new.data=old.data then return null; end if;
   if auth.uid() is not null and
      (nullif(new.data->>'_expectedUpdatedAt','') is null or
       (new.data->>'_expectedUpdatedAt')::timestamptz is distinct from old.updated_at) then
     raise exception 'Library changed or outdated app. Refresh before saving; existing data protected.';
   end if;
 end if;
 insert into submittal_recovery.settings_history(tenant_id,data,original_updated_at,actor_id,reason)
 values(old.tenant_id,old.data,old.updated_at,auth.uid(),TG_OP);
 if TG_OP='DELETE' then return old; end if;
 new.data := new.data - '_expectedUpdatedAt';
 new.updated_at := clock_timestamp();
 return new;
end $$;
revoke all on function submittal_recovery.protect_settings() from public,anon,authenticated;
create trigger submittal_settings_recovery_guard before update or delete
 on public.submittal_lite_settings for each row execute function submittal_recovery.protect_settings();