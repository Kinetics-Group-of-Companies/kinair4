create table public.submittal_reply_bank (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
 scope jsonb not null, row jsonb not null, applicability text not null check(length(btrim(applicability))>=10),
 created_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
 check(coalesce(row->>'reviewed'='true',false)), check(coalesce(length(btrim(row->>'reply'))>0,false)),
 check(coalesce(jsonb_typeof(row->'evidence')='array' and jsonb_array_length(row->'evidence')>0,false))
);
create index on public.submittal_reply_bank(tenant_id,created_at desc);
alter table public.submittal_reply_bank enable row level security;
create policy reply_read on public.submittal_reply_bank for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_reply_bank.tenant_id and p.is_approved));
create policy reply_save on public.submittal_reply_bank for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_reply_bank.tenant_id and p.is_approved));
create policy reply_remove on public.submittal_reply_bank for delete to authenticated using(created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_reply_bank.tenant_id and p.is_approved));
revoke all on public.submittal_reply_bank from authenticated;
grant select,insert,delete on public.submittal_reply_bank to authenticated;
revoke all on public.submittal_reply_bank from anon;
create table public.submittal_ai_usage (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,user_id uuid not null,request_id uuid not null,
 action text not null,provider text not null,model text not null,outcome text not null check(outcome in ('generated','error')),
 input_tokens bigint check(input_tokens>=0),output_tokens bigint check(output_tokens>=0),latency_ms integer not null check(latency_ms>=0),created_at timestamptz not null default now()
);
create index on public.submittal_ai_usage(tenant_id,created_at desc,id);
alter table public.submittal_ai_usage enable row level security;
create policy usage_read on public.submittal_ai_usage for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_ai_usage.tenant_id and p.is_approved));
revoke all on public.submittal_ai_usage from anon,authenticated;
grant select on public.submittal_ai_usage to authenticated;
grant all on public.submittal_ai_usage to service_role;
create table public.submittal_ai_rates (
 tenant_id uuid not null,provider text not null,model text not null,input_usd numeric not null check(input_usd>=0 and input_usd<1000000),output_usd numeric not null check(output_usd>=0 and output_usd<1000000),primary key(tenant_id,provider,model)
);
alter table public.submittal_ai_rates enable row level security;
create policy rates_read on public.submittal_ai_rates for select to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_ai_rates.tenant_id and p.is_approved));
create policy rates_insert on public.submittal_ai_rates for insert to authenticated with check(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_ai_rates.tenant_id and p.is_approved));
create policy rates_update on public.submittal_ai_rates for update to authenticated using(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_ai_rates.tenant_id and p.is_approved)) with check(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.tenant_id=submittal_ai_rates.tenant_id and p.is_approved));
revoke all on public.submittal_ai_rates from anon;
revoke all on public.submittal_ai_rates from authenticated;
grant select,insert,update on public.submittal_ai_rates to authenticated;
