ALTER TABLE public.motor_specifications
  ADD COLUMN IF NOT EXISTS series_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS model_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.motor_specifications
SET series_ids = CASE WHEN series_id IS NOT NULL THEN ARRAY[series_id] ELSE '{}' END,
    model_ids = CASE WHEN model_id IS NOT NULL THEN ARRAY[model_id] ELSE '{}' END
WHERE (series_id IS NOT NULL OR model_id IS NOT NULL)
  AND cardinality(series_ids) = 0 AND cardinality(model_ids) = 0;