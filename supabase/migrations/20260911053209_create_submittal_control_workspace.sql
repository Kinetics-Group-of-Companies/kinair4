
create type public.submittal_package_type as enum ('regular','pq','om');
create type public.submittal_package_status as enum ('draft','generated','failed');
create type public.submittal_approval_status as enum ('no_update','approved','not_approved');

create table public.submittal_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create table public.submittal_product_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.submittal_products(id) on delete cascade,
  name text not null,
  code text,
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);
create table public.submittal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.submittal_products(id) on delete cascade,
  model_id uuid references public.submittal_product_models(id) on delete cascade,
  category text not null,
  display_name text not null,
  storage_path text not null,
  company_name text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (not (product_id is not null and model_id is not null))
);
create table public.submittal_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_name text not null,
  template_type text not null check (template_type in ('cover','index','divider','stamp')),
  display_name text not null,
  storage_path text not null,
  field_map jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.submittal_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_type public.submittal_package_type not null default 'regular',
  status public.submittal_package_status not null default 'draft',
  approval_status public.submittal_approval_status not null default 'no_update',
  reference text,
  revision integer not null default 0 check (revision >= 0),
  quotation_reference text,
  quotation_value numeric(14,2),
  sales_engineer text,
  project_name text not null,
  material text,
  client_name text,
  client_title text not null default 'CLIENT',
  consultant_name text,
  consultant_title text not null default 'CONSULTANT',
  main_contractor_name text,
  main_contractor_title text not null default 'MAIN CONTRACTOR',
  subcontractor_name text,
  subcontractor_title text not null default 'MEP CONTRACTOR',
  submitted_by_company text,
  submitted_by_role text not null default 'SUPPLIER',
  apply_stamp boolean not null default false,
  submission_date date not null default current_date,
  equipment_tag text,
  commissioning_date date,
  warranty_period text,
  output_storage_path text,
  failure_message text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.submittal_package_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.submittal_packages(id) on delete cascade,
  product_id uuid references public.submittal_products(id) on delete set null,
  model_id uuid references public.submittal_product_models(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.submittal_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.submittal_packages(id) on delete cascade,
  section_name text not null,
  display_name text not null,
  storage_path text not null,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.submittal_approval_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.submittal_packages(id) on delete cascade,
  status public.submittal_approval_status not null,
  note text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now()
);

create index submittal_packages_tenant_date_idx on public.submittal_packages(tenant_id, submission_date desc);
create index submittal_packages_tenant_status_idx on public.submittal_packages(tenant_id, status, approval_status);
create index submittal_models_product_idx on public.submittal_product_models(product_id);
create index submittal_documents_tenant_category_idx on public.submittal_documents(tenant_id, category);
create index submittal_items_package_idx on public.submittal_package_items(package_id, sort_order);
create index submittal_attachments_package_idx on public.submittal_attachments(package_id, sort_order);

alter table public.submittal_products enable row level security;
alter table public.submittal_product_models enable row level security;
alter table public.submittal_documents enable row level security;
alter table public.submittal_templates enable row level security;
alter table public.submittal_packages enable row level security;
alter table public.submittal_package_items enable row level security;
alter table public.submittal_attachments enable row level security;
alter table public.submittal_approval_events enable row level security;

grant select, insert, update, delete on public.submittal_products, public.submittal_product_models, public.submittal_documents, public.submittal_templates, public.submittal_packages, public.submittal_package_items, public.submittal_attachments, public.submittal_approval_events to authenticated;

create policy "tenant members manage submittal products" on public.submittal_products for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())) and created_by = (select auth.uid()));
create policy "tenant members manage submittal models" on public.submittal_product_models for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())) and created_by = (select auth.uid()));
create policy "tenant members manage submittal documents" on public.submittal_documents for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())) and created_by = (select auth.uid()));
create policy "tenant members manage submittal templates" on public.submittal_templates for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())) and created_by = (select auth.uid()));
create policy "tenant members manage submittal packages" on public.submittal_packages for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "tenant members manage package items" on public.submittal_package_items for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())));
create policy "tenant members manage attachments" on public.submittal_attachments for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())) and created_by = (select auth.uid()));
create policy "tenant members manage approvals" on public.submittal_approval_events for all to authenticated
using (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())))
with check (tenant_id in (select tenant_id from public.profiles where user_id = (select auth.uid())) and recorded_by = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submittal-control', 'submittal-control', false, 52428800, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

create policy "tenant members read submittal files" on storage.objects for select to authenticated
using (bucket_id = 'submittal-control' and (storage.foldername(name))[1] in (
  select tenant_id::text from public.profiles where user_id = (select auth.uid())
));
create policy "tenant members upload submittal files" on storage.objects for insert to authenticated
with check (bucket_id = 'submittal-control' and (storage.foldername(name))[1] in (
  select tenant_id::text from public.profiles where user_id = (select auth.uid())
));
create policy "tenant members update submittal files" on storage.objects for update to authenticated
using (bucket_id = 'submittal-control' and (storage.foldername(name))[1] in (
  select tenant_id::text from public.profiles where user_id = (select auth.uid())
))
with check (bucket_id = 'submittal-control' and (storage.foldername(name))[1] in (
  select tenant_id::text from public.profiles where user_id = (select auth.uid())
));
create policy "tenant members delete submittal files" on storage.objects for delete to authenticated
using (bucket_id = 'submittal-control' and (storage.foldername(name))[1] in (
  select tenant_id::text from public.profiles where user_id = (select auth.uid())
));
