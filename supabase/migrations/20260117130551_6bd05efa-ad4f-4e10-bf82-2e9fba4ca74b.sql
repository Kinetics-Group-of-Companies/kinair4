-- Add secondary RPM for dual-speed motors
ALTER TABLE motor_specifications 
ADD COLUMN IF NOT EXISTS secondary_rpm INTEGER;

COMMENT ON COLUMN motor_specifications.secondary_rpm IS 'Secondary RPM for dual-speed motors (low speed RPM)';