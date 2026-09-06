-- Drop the old unique constraints that don't include series_id
ALTER TABLE casing_weights DROP CONSTRAINT IF EXISTS casing_weights_tenant_id_diameter_key;
ALTER TABLE impeller_weights DROP CONSTRAINT IF EXISTS impeller_weights_tenant_id_diameter_blade_count_key;

-- The correct constraints already exist:
-- casing_weights_series_diameter_key: UNIQUE (series_id, diameter, model_name)
-- impeller_weights_series_diameter_blade_key: UNIQUE (series_id, diameter, blade_count, model_name)