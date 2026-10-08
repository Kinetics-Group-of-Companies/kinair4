create table public.submittal_compliance_library (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 title text not null,
 scope jsonb not null,
 sheet jsonb not null,
 approved boolean not null default false,
 parent_id uuid references public.submittal_compliance_library(id),
 constraint compliance_library_id_tenant_unique unique(id,tenant_id),
 constraint compliance_library_parent_tenant foreign key(parent_id,tenant_id) references public.submittal_compliance_library(id,tenant_id),
 constraint compliance_sheet_size check (octet_length(sheet::text) <= 4000000),
 constraint compliance_sheet_object check (jsonb_typeof(sheet)='object'),
 constraint compliance_scope_object check (jsonb_typeof(scope)='object')
);
create index compliance_library_tenant_date on public.submittal_compliance_library(tenant_id,created_at desc);
alter table public.submittal_compliance_library enable row level security;
revoke all on public.submittal_compliance_library from anon,authenticated;
grant select,insert on public.submittal_compliance_library to authenticated;
grant all on public.submittal_compliance_library to service_role;
create policy compliance_library_read on public.submittal_compliance_library for select to authenticated using (
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_compliance_library.tenant_id and p.is_approved=true)
);
create policy compliance_library_save on public.submittal_compliance_library for insert to authenticated with check (
 created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_compliance_library.tenant_id and p.is_approved=true)
);
