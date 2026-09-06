ALTER TABLE public.air_curtain_models
  ADD COLUMN IF NOT EXISTS noise_63 numeric,
  ADD COLUMN IF NOT EXISTS noise_125 numeric,
  ADD COLUMN IF NOT EXISTS noise_250 numeric,
  ADD COLUMN IF NOT EXISTS noise_500 numeric,
  ADD COLUMN IF NOT EXISTS noise_1k numeric,
  ADD COLUMN IF NOT EXISTS noise_2k numeric,
  ADD COLUMN IF NOT EXISTS noise_4k numeric,
  ADD COLUMN IF NOT EXISTS noise_8k numeric;