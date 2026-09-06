ALTER TABLE public.air_curtain_models
  ADD COLUMN IF NOT EXISTS voltage text,
  ADD COLUMN IF NOT EXISTS frequency_hz numeric;

ALTER TABLE public.air_curtain_series
  ADD COLUMN IF NOT EXISTS voltage text,
  ADD COLUMN IF NOT EXISTS frequency_hz numeric;

UPDATE public.air_curtain_models SET frequency_hz = 50 WHERE frequency_hz IS NULL;
UPDATE public.air_curtain_models SET voltage = '220-240V' WHERE voltage IS NULL;