-- Add ATEX rating column to motor_specifications table
ALTER TABLE public.motor_specifications 
ADD COLUMN atex_rating text;

-- Update ATEX rating descriptions with the new codes
DELETE FROM public.atex_rating_descriptions;

INSERT INTO public.atex_rating_descriptions (tenant_id, atex_code, description) VALUES
('00000000-0000-0000-0000-000000000001', 'II2GExdIIB(H2)T4', 'Group II Category 2G, Flameproof Ex d, Gas Group IIB including Hydrogen, Temperature Class T4 (135°C)'),
('00000000-0000-0000-0000-000000000001', 'II2GExdIIBT4', 'Group II Category 2G, Flameproof Ex d, Gas Group IIB, Temperature Class T4 (135°C)'),
('00000000-0000-0000-0000-000000000001', 'II2GExeIIT3', 'Group II Category 2G, Increased Safety Ex e, Gas Group II, Temperature Class T3 (200°C)'),
('00000000-0000-0000-0000-000000000001', 'II3DExtcIIIBT125', 'Group II Category 3D, Dust Protection by Enclosure Ex tc, Dust Group IIIB, Max Surface Temp 125°C'),
('00000000-0000-0000-0000-000000000001', 'II3DExtcIIICT125', 'Group II Category 3D, Dust Protection by Enclosure Ex tc, Dust Group IIIC, Max Surface Temp 125°C');