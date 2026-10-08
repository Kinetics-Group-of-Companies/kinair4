-- Server-side guards complement RLS; private tombstones cannot be changed by clients.
create schema if not exists submittal_private;
revoke all on schema submittal_private from public, anon, authenticated;
create table if not exists submittal_private.deleted_records (
  id text primary key, tenant_id uuid not null, deleted_at timestamptz not null default now()
);
alter table submittal_private.deleted_records enable row level security;
create or replace function submittal_private.guard_record_write() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if TG_OP = 'DELETE' then
    insert into submittal_private.deleted_records(id,tenant_id) values(old.id,old.tenant_id) on conflict(id) do nothing;
    return old;
  end if;
  if exists(select 1 from submittal_private.deleted_records where id=new.id) then
    raise exception 'This draft was deleted. Refresh the register; it cannot be restored by saving an old tab.' using errcode='40001';
  end if;
  if TG_OP = 'UPDATE' then
    if new.id <> old.id or new.tenant_id <> old.tenant_id or new.ref <> old.ref or new.rev <> old.rev then
      raise exception 'Record identity cannot change. Create a new revision.' using errcode='40001';
    end if;
    if (new.data->>'_expectedUpdatedAt') is null or (new.data->>'_expectedUpdatedAt')::timestamptz <> old.updated_at then
      raise exception 'This submittal changed in another tab or device. Refresh before saving; your changes were not overwritten.' using errcode='40001';
    end if;
    if old.data->'issuedPdf' is not null and old.data->'issuedPdf' <> 'null'::jsonb and
       (new.data - array['status','history','updatedAt','_expectedUpdatedAt']) is distinct from
       (old.data - array['status','history','updatedAt','_expectedUpdatedAt']) then
      raise exception 'Issued revisions are locked. Create a new revision to change the content.' using errcode='40001';
    end if;
  end if;
  if new.data->>'status' in ('Submitted','Under review','Approved','Approved as noted') and
     (new.data->'issuedPdf' is null or new.data->'issuedPdf' = 'null'::jsonb) then
    raise exception 'Open the builder and issue a checked PDF before changing to this status.' using errcode='23514';
  end if;
  if new.data->>'status' in ('Submitted','Under review','Approved','Approved as noted') then
    if jsonb_array_length(coalesce(new.data->'technicalIssues','[]'::jsonb)) > 0 then
      raise exception 'Resolve technical checks before issuing.' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_array_elements(coalesce(new.data->'rtcc','[]'::jsonb)) r,
      lateral jsonb_array_elements(coalesce(r->'rows','[]'::jsonb)) row_data
      where coalesce((row_data->>'reviewed')::boolean,false) = false or btrim(coalesce(row_data->>'reply','')) = '') then
      raise exception 'Review every RTCC reply before issuing.' using errcode='23514';
    end if;
  end if;
  new.data := new.data - '_expectedUpdatedAt';
  return new;
end;
$$;
revoke all on function submittal_private.guard_record_write() from public, anon, authenticated;
drop trigger if exists submittal_record_write_guard on public.submittal_lite_records;
create trigger submittal_record_write_guard before insert or update or delete on public.submittal_lite_records
for each row execute function submittal_private.guard_record_write();
