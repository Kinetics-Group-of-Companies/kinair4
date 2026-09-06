-- Add secondary rating for dual-speed motors
ALTER TABLE motor_specifications 
ADD COLUMN IF NOT EXISTS secondary_rating_kw DECIMAL(10,2);

COMMENT ON COLUMN motor_specifications.secondary_rating_kw IS 'Secondary kW rating for dual-speed motors (e.g., 2.2 for a 9/2.2 kW motor)';