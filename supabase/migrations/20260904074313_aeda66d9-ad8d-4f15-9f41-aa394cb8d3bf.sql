ALTER TABLE public.lpo_orders
  ADD COLUMN IF NOT EXISTS material_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cost_value numeric,
  ADD COLUMN IF NOT EXISTS lead_time_weeks_min integer,
  ADD COLUMN IF NOT EXISTS lead_time_weeks_max integer,
  ADD COLUMN IF NOT EXISTS revised_lpo_ref text,
  ADD COLUMN IF NOT EXISTS revised_lpo_date date,
  ADD COLUMN IF NOT EXISTS revised_lpo_received_date date,
  ADD COLUMN IF NOT EXISTS revised_order_value numeric,
  ADD COLUMN IF NOT EXISTS revised_lead_time_weeks_min integer,
  ADD COLUMN IF NOT EXISTS revised_lead_time_weeks_max integer,
  ADD COLUMN IF NOT EXISTS revision_notes text,
  ADD COLUMN IF NOT EXISTS suppliers jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.lpo_orders
SET material_types = ARRAY[material_type]
WHERE material_types = '{}' AND material_type IS NOT NULL;