-- Unified multi-user submittal workspace
alter table public.submittal_packages
  add column if not exists version integer not null default 1,
  add column if not exists editing_by uuid references auth.users(id) on delete set null,
  add column if not exists editing_at timestamptz;

do $$ begin alter publication supabase_realtime add table public.submittal_packages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.submittal_package_items; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.submittal_package_products; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.submittal_attachments; exception when duplicate_object then null; end $$;
