create table public.submittal_internal_reviews (
 record_id text primary key references public.submittal_lite_records(id) on delete cascade,
 tenant_id uuid not null, engineer_id uuid not null, reviewer_id uuid not null,
 requested_by uuid not null, due_date date,
 status text not null check(status in ('pending','approved','changes_requested')),
 snapshot jsonb not null, history jsonb not null default '[]',
 updated_at timestamptz not null default now(), check(engineer_id <> reviewer_id)
);
alter table public.submittal_internal_reviews enable row level security;
create policy internal_review_read on public.submittal_internal_reviews for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_approved and p.tenant_id=submittal_internal_reviews.tenant_id));
revoke all on public.submittal_internal_reviews from anon,authenticated;
grant select on public.submittal_internal_reviews to authenticated;
grant all on public.submittal_internal_reviews to service_role;
create index on public.submittal_internal_reviews(tenant_id,due_date);

create or replace function public.submittal_review_content(value jsonb) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select value - array['status','history','updatedAt','_expectedUpdatedAt','issuedPdf','issuedLabels','issuedAt'];
$$;
revoke all on function public.submittal_review_content(jsonb) from public,anon;
grant execute on function public.submittal_review_content(jsonb) to authenticated,service_role;
create or replace function submittal_private.check_internal_review() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare review public.submittal_internal_reviews;
begin
 if new.data->'issuedPdf' is not null and new.data->'issuedPdf' <> 'null'::jsonb then
  select * into review from public.submittal_internal_reviews where record_id=new.id and tenant_id=new.tenant_id;
  if found and (review.status <> 'approved' or review.snapshot is distinct from public.submittal_review_content(new.data)) then
   raise exception 'Internal review is pending or outdated. Save the draft and obtain reviewer approval before issuing.' using errcode='23514';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function submittal_private.check_internal_review() from public,anon,authenticated;
create trigger submittal_internal_review_gate before insert or update on public.submittal_lite_records for each row execute function submittal_private.check_internal_review();

create table public.submittal_package_jobs (
 id uuid primary key, tenant_id uuid not null, created_by uuid not null,
 fingerprint text not null, title text not null, recipient text not null default '', purpose text not null,
 sources jsonb not null, status text not null check(status in ('queued','running','complete','failed')),
 progress integer not null default 0, error text, output_path text, page_count integer,
 attempt_id uuid, share_url text, share_expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,created_by,fingerprint)
);
alter table public.submittal_package_jobs enable row level security;
create policy package_jobs_read on public.submittal_package_jobs for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_approved and p.tenant_id=submittal_package_jobs.tenant_id));
revoke all on public.submittal_package_jobs from anon,authenticated;
grant select on public.submittal_package_jobs to authenticated;
grant all on public.submittal_package_jobs to service_role;
create index on public.submittal_package_jobs(tenant_id,created_at desc);
