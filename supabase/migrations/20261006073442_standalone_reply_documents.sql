create table public.submittal_reply_documents (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 kind text not null check (kind in ('compliance','rtcc')),
 title text not null default '',
 data jsonb not null,
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index submittal_reply_documents_tenant_updated on public.submittal_reply_documents(tenant_id, updated_at desc);
alter table public.submittal_reply_documents enable row level security;
revoke all on public.submittal_reply_documents from anon, authenticated;
grant select, insert, update on public.submittal_reply_documents to authenticated;
create policy reply_documents_read on public.submittal_reply_documents for select to authenticated using
 (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid()) and is_approved=true));
create policy reply_documents_insert on public.submittal_reply_documents for insert to authenticated with check
 (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid()) and is_approved=true));
create policy reply_documents_update on public.submittal_reply_documents for update to authenticated using
 (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid()) and is_approved=true)) with check
 (tenant_id in (select tenant_id from public.profiles where user_id=(select auth.uid()) and is_approved=true));
