create table public.submittal_package_revisions (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 package_id uuid not null references public.submittal_packages(id) on delete cascade,
 revision integer not null,
 snapshot jsonb not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(package_id,revision)
);
create index submittal_revisions_package_idx on public.submittal_package_revisions(package_id,revision desc);
alter table public.submittal_package_revisions enable row level security;
grant select,insert on public.submittal_package_revisions to authenticated;
create policy "tenant members read package revisions" on public.submittal_package_revisions for select to authenticated using (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid())));
create policy "tenant members create package revisions" on public.submittal_package_revisions for insert to authenticated with check (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid())) and created_by=(select auth.uid()));
