-- Advanced automatic submittal builder
alter table public.submittal_packages
  add column if not exists cover_details jsonb not null default '{}'::jsonb,
  add column if not exists index_sections jsonb not null default '[]'::jsonb,
  add column if not exists validation_report jsonb not null default '{}'::jsonb,
  add column if not exists customer_source_path text;

alter table public.submittal_documents
  add column if not exists scope_type text not null default 'company',
  add column if not exists package_id uuid references public.submittal_packages(id) on delete cascade,
  add column if not exists series_name text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists is_active boolean not null default true,
  add column if not exists is_mandatory boolean not null default false,
  add column if not exists expires_on date,
  add column if not exists page_count integer;

alter table public.submittal_package_items
  add column if not exists section_name text,
  add column if not exists document_id uuid references public.submittal_documents(id) on delete set null,
  add column if not exists source_type text not null default 'library',
  add column if not exists display_name text,
  add column if not exists storage_path text,
  add column if not exists is_included boolean not null default true,
  add column if not exists is_required boolean not null default false,
  add column if not exists validation_state text not null default 'ready',
  add column if not exists notes text;

do $$ begin alter table public.submittal_documents add constraint submittal_documents_scope_type_check check (scope_type in ('company','product','series','model','project')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.submittal_package_items add constraint submittal_package_items_source_type_check check (source_type in ('library','upload','generated')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.submittal_package_items add constraint submittal_package_items_validation_state_check check (validation_state in ('ready','missing','expired','warning')); exception when duplicate_object then null; end $$;

create table if not exists public.submittal_package_products (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 package_id uuid not null references public.submittal_packages(id) on delete cascade,
 product_id uuid references public.submittal_products(id) on delete set null,
 model_id uuid references public.submittal_product_models(id) on delete set null,
 quantity integer not null default 1 check (quantity > 0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(package_id, model_id)
);
alter table public.submittal_package_products enable row level security;
do $$ begin create policy "tenant members manage package products" on public.submittal_package_products for all to authenticated using (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid()))) with check (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid())) and created_by=(select auth.uid())); exception when duplicate_object then null; end $$;
grant select,insert,update,delete on public.submittal_package_products to authenticated;

create index if not exists submittal_documents_match_idx on public.submittal_documents(tenant_id,category,scope_type,package_id,product_id,model_id);
create index if not exists submittal_package_items_order_idx on public.submittal_package_items(package_id,sort_order);
create index if not exists submittal_package_products_package_idx on public.submittal_package_products(package_id);
