-- Complete remaining policies (motor_brands already done)

-- Drop the existing policy first then recreate
DROP POLICY IF EXISTS "All users can view default tenant motor brands" ON public.motor_brands;
CREATE POLICY "All users can view default tenant motor brands" 
ON public.motor_brands FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- CASING_WEIGHTS: Fix policies
DROP POLICY IF EXISTS "All users can view default tenant casing weights" ON public.casing_weights;
CREATE POLICY "All users can view default tenant casing weights" 
ON public.casing_weights FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- IMPELLER_WEIGHTS: Fix policies
DROP POLICY IF EXISTS "All users can view default tenant impeller weights" ON public.impeller_weights;
CREATE POLICY "All users can view default tenant impeller weights" 
ON public.impeller_weights FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- UNIT_PREFERENCES: Fix policies
DROP POLICY IF EXISTS "All users can view default tenant unit prefs" ON public.unit_preferences;
CREATE POLICY "All users can view default tenant unit prefs" 
ON public.unit_preferences FOR SELECT 
USING (tenant_id = '00000000-0000-0000-0000-000000000001');