-- Add dual-speed motor support fields
ALTER TABLE motor_specifications 
ADD COLUMN IF NOT EXISTS is_dual_speed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS secondary_poles INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN motor_specifications.is_dual_speed IS 'Indicates if this is a dual-speed motor';
COMMENT ON COLUMN motor_specifications.secondary_poles IS 'Secondary pole count for dual-speed motors (e.g., 6 for a 4/6 motor)';