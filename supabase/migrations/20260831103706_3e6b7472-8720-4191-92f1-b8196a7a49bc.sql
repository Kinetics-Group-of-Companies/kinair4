alter table public.air_curtain_models add column if not exists slot_width_mm numeric default 50;
update public.air_curtain_models set slot_width_mm = 50 where slot_width_mm is null;