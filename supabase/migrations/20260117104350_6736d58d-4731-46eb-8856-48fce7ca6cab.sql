-- Add nomenclature template field to fan_series table
ALTER TABLE public.fan_series 
ADD COLUMN nomenclature_template TEXT DEFAULT '{series}-{size}';

-- Update existing series with appropriate templates
UPDATE public.fan_series SET nomenclature_template = 'KTAF/{poles}-{diameter}-{blades}/{angle}°-{power}kW' WHERE name = 'TAF';
UPDATE public.fan_series SET nomenclature_template = 'KVF-{size}M' WHERE name = 'KVF-M';
UPDATE public.fan_series SET nomenclature_template = 'KVF-{size}MR' WHERE name = 'KVF-MR';
UPDATE public.fan_series SET nomenclature_template = 'KVF-{size}P' WHERE name = 'KVF-P';