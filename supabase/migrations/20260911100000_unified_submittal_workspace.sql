-- Unified multi-user submittal workspace
alter table public.submittal_packages
  add column if not exists version integer not null default 1,
  add column if not exists editing_by uuid references auth.users(id) on delete set null,
  add column if not exists editing_at timestamptz;

do $$ begin alter publication supabase_realtime add table public.submittal_packages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.submittal_package_items; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.submittal_package_products; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.submittal_attachments; exception when duplicate_object then null; end $$;

create or replace function public.bump_submittal_package_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists bump_submittal_package_version on public.submittal_packages;
create trigger bump_submittal_package_version
before update on public.submittal_packages
for each row execute function public.bump_submittal_package_version();

revoke execute on function public.bump_submittal_package_version() from public, anon, authenticated;
