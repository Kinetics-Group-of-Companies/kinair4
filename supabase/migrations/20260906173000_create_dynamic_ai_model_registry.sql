create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google','openai','anthropic')),
  model_id text not null,
  display_name text not null,
  tier text not null check (tier in ('free','cheap','balanced','premium')),
  cost_rank integer not null default 100 check (cost_rank >= 0),
  enabled boolean not null default false,
  supports_tools boolean not null default false,
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, model_id)
);

alter table public.ai_models enable row level security;
revoke all on public.ai_models from anon, authenticated;
grant select on public.ai_models to authenticated;

drop policy if exists "Authenticated users can read enabled AI models" on public.ai_models;
create policy "Authenticated users can read enabled AI models"
on public.ai_models for select
to authenticated
using (enabled = true);

create index if not exists ai_models_active_order_idx
on public.ai_models (enabled, cost_rank, provider);

insert into public.ai_models
  (provider, model_id, display_name, tier, cost_rank, enabled, supports_tools)
values
  ('google','gemini-3.6-flash','Gemini 3.6 Flash','free',0,true,true),
  ('openai','gpt-5.6-luna','OpenAI GPT-5.6 Luna','cheap',10,true,true),
  ('anthropic','claude-haiku-4-5-20251001','Claude Haiku 4.5','cheap',20,true,true),
  ('openai','gpt-5.6-terra','OpenAI GPT-5.6 Terra','balanced',30,true,true),
  ('anthropic','claude-sonnet-5','Claude Sonnet 5','balanced',40,true,true),
  ('openai','gpt-5.6-sol','OpenAI GPT-5.6 Sol','premium',50,true,true),
  ('anthropic','claude-opus-5','Claude Opus 5','premium',60,true,true)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  tier = excluded.tier,
  cost_rank = excluded.cost_rank,
  enabled = excluded.enabled,
  supports_tools = excluded.supports_tools,
  last_seen_at = now();
