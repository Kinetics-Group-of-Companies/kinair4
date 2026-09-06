-- Add phase column to motor_specifications table
ALTER TABLE public.motor_specifications 
ADD COLUMN phase integer DEFAULT 3;

-- Add comment for clarity
COMMENT ON COLUMN public.motor_specifications.phase IS 'Motor phase: 1 for single-phase, 3 for three-phase';

-- Update existing motors to 3-phase (default)
UPDATE public.motor_specifications SET phase = 3 WHERE phase IS NULL;