create table if not exists public.submittal_lite_records (
  id text primary key,
  tenant_id uuid not null,
  ref text not null,
  rev integer not null check (rev >= 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, ref, rev)
);
create index if not exists submittal_lite_records_tenant_updated on public.submittal_lite_records (tenant_id, updated_at desc);
alter table public.submittal_lite_records enable row level security;
create policy "tenant members read lite records" on public.submittal_lite_records for select to authenticated using
  (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true));
create policy "tenant members insert lite records" on public.submittal_lite_records for insert to authenticated with check
  (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true));
create policy "tenant members update lite records" on public.submittal_lite_records for update to authenticated using
  (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true))
  with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true));
create policy "tenant members delete lite records" on public.submittal_lite_records for delete to authenticated using
  (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true));
grant select, insert, update, delete on public.submittal_lite_records to authenticated;
create table if not exists public.submittal_lite_settings (
  tenant_id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.submittal_lite_settings enable row level security;
create policy "tenant members read lite settings" on public.submittal_lite_settings for select to authenticated using
  (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true));
create policy "tenant members insert lite settings" on public.submittal_lite_settings for insert to authenticated with check
  (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true));
create policy "tenant members update lite settings" on public.submittal_lite_settings for update to authenticated using
  (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true))
  with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid()) and is_approved = true));
grant select, insert, update on public.submittal_lite_settings to authenticated;
