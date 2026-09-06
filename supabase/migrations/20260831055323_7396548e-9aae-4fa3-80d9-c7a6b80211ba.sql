CREATE TABLE public.air_curtain_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  model text NOT NULL,
  category text NOT NULL DEFAULT 'surface',
  impeller_diameter integer,
  length_mm integer NOT NULL,
  input_power_w numeric,
  input_power_low_w numeric,
  air_velocity_ms numeric,
  air_velocity_low_ms numeric,
  air_volume_cmh numeric,
  air_volume_cfm numeric,
  air_volume_low_cmh numeric,
  air_volume_low_cfm numeric,
  noise_db numeric,
  noise_low_db numeric,
  net_weight_kg numeric,
  gross_weight_kg numeric,
  unit_size text,
  carton_size text,
  mounting_height_min numeric,
  mounting_height_max numeric,
  remarks text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_curtain_models TO authenticated;
GRANT ALL ON public.air_curtain_models TO service_role;

ALTER TABLE public.air_curtain_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant air curtains"
ON public.air_curtain_models FOR SELECT TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Anyone can view default tenant air curtains"
ON public.air_curtain_models FOR SELECT TO authenticated
USING (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Admins can insert air curtains"
ON public.air_curtain_models FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update air curtains"
ON public.air_curtain_models FOR UPDATE TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete air curtains"
ON public.air_curtain_models FOR DELETE TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_air_curtain_models_updated_at
BEFORE UPDATE ON public.air_curtain_models
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_air_curtain_models_tenant ON public.air_curtain_models(tenant_id);

INSERT INTO public.air_curtain_models (tenant_id, model, category, impeller_diameter, length_mm, input_power_w, input_power_low_w, air_velocity_ms, air_velocity_low_ms, air_volume_cmh, air_volume_cfm, air_volume_low_cmh, air_volume_low_cfm, noise_db, noise_low_db, net_weight_kg, gross_weight_kg, unit_size, carton_size, mounting_height_min, mounting_height_max, remarks, display_order) VALUES
('00000000-0000-0000-0000-000000000001','FM-3509-L(/Y)','surface',120,900,230,NULL,14.5,NULL,1020,600,NULL,NULL,44,NULL,16.0,17.5,'900×220×212','960×290×270',3,3.5,NULL,1),
('00000000-0000-0000-0000-000000000001','FM-3510-L(/Y)','surface',120,1000,230,NULL,14.5,NULL,1020,600,NULL,NULL,44,NULL,17.5,19.8,'1000×220×212','1060×290×270',3,3.5,NULL,2),
('00000000-0000-0000-0000-000000000001','FM-3512-L(/Y)','surface',120,1200,305,NULL,14.5,NULL,1360,800,NULL,NULL,45,NULL,19.0,21.0,'1200×220×212','1260×290×270',3,3.5,NULL,3),
('00000000-0000-0000-0000-000000000001','FM-3515-L(/Y)','surface',120,1500,380,NULL,14.5,NULL,1700,1000,NULL,NULL,48,NULL,25.0,27.5,'1500×220×212','1560×290×270',3,3.5,NULL,4),
('00000000-0000-0000-0000-000000000001','FM-3518-L(/Y)','surface',120,1800,450,NULL,14.5,NULL,2040,1200,NULL,NULL,51,NULL,30.0,33.0,'1800×220×212','1860×290×270',3,3.5,NULL,5),
('00000000-0000-0000-0000-000000000001','FM-4509-L(/Y)','surface',120,900,360,NULL,18.0,NULL,1260,741,NULL,NULL,46,NULL,16.5,18.0,'900×220×212','960×290×270',4,4.5,NULL,6),
('00000000-0000-0000-0000-000000000001','FM-4510-L(/Y)','surface',120,1000,360,NULL,18.0,NULL,1260,741,NULL,NULL,46,NULL,17.5,19.3,'1000×220×212','1060×290×270',4,4.5,NULL,7),
('00000000-0000-0000-0000-000000000001','FM-4512-L(/Y)','surface',120,1200,495,NULL,18.0,NULL,1680,988,NULL,NULL,47,NULL,21.0,23.0,'1200×220×212','1260×290×270',4,4.5,NULL,8),
('00000000-0000-0000-0000-000000000001','FM-4515-L(/Y)','surface',120,1500,605,NULL,18.0,NULL,2100,1235,NULL,NULL,50,NULL,26.0,29.5,'1500×220×212','1560×290×270',4,4.5,NULL,9),
('00000000-0000-0000-0000-000000000001','FM-4518-L(/Y)','surface',120,1800,750,NULL,18.0,NULL,2520,1482,NULL,NULL,53,NULL,30.5,33.5,'1800×220×212','1860×290×270',4,4.5,NULL,10),
('00000000-0000-0000-0000-000000000001','FM-5509-L(/Y)','surface',120,900,450,NULL,21.0,NULL,1520,894,NULL,NULL,52,NULL,17.5,19.0,'900×220×212','960×290×270',5,5.5,NULL,11),
('00000000-0000-0000-0000-000000000001','FM-5510-L(/Y)','surface',120,1000,450,NULL,21.0,NULL,1520,894,NULL,NULL,52,NULL,19.0,20.8,'1000×220×212','1060×290×270',5,5.5,NULL,12),
('00000000-0000-0000-0000-000000000001','FM-5512-L(/Y)','surface',120,1200,600,NULL,21.0,NULL,2027,1192,NULL,NULL,54,NULL,21.5,23.5,'1200×220×212','1260×290×270',5,5.5,NULL,13),
('00000000-0000-0000-0000-000000000001','FM-5515-L(/Y)','surface',120,1500,750,NULL,21.0,NULL,2534,1490,NULL,NULL,55,NULL,27.0,29.5,'1500×220×212','1560×290×270',5,5.5,NULL,14),
('00000000-0000-0000-0000-000000000001','FM-5518-L(/Y)','surface',120,1800,900,NULL,21.0,NULL,3040,1788,NULL,NULL,58,NULL,31.0,34.0,'1800×220×212','1860×290×270',5,5.5,NULL,15),
('00000000-0000-0000-0000-000000000001','FM-3509XD(B)-L/(Y)','recessed',120,900,210,157,15.5,12.5,1090,641,880,518,45,43,17.5,19,'900x245x233','950x315x270',3,3.5,'Stainless Steel (PCM)',16),
('00000000-0000-0000-0000-000000000001','FM-3510XD(B)-L/(Y)','recessed',120,1000,210,157,15.5,12.5,1090,641,880,518,45,43,18.8,20.5,'1000x245x233','1050x315x270',3,3.5,'Stainless Steel (PCM)',17),
('00000000-0000-0000-0000-000000000001','FM-3512XD(B)-L/(Y)','recessed',120,1200,280,211,15.5,12.5,1450,853,1170,688,47,45,21,23,'1200x245x233','1250x315x270',3,3.5,'Stainless Steel (PCM)',18),
('00000000-0000-0000-0000-000000000001','FM-3515XD(B)-L/(Y)','recessed',120,1500,350,258,15.5,12.5,1820,1070,1470,865,50,47,27,29.5,'1500x245x233','1550x315x270',3,3.5,'Stainless Steel (PCM)',19),
('00000000-0000-0000-0000-000000000001','FM-3518XD(B)-L/(Y)','recessed',120,1800,424,315,15.5,12.5,2200,1276,1758,1030,53,50,31.5,34.5,'1800x245x233','1850x315x270',3,3.5,'Stainless Steel (PCM)',20),
('00000000-0000-0000-0000-000000000001','FM-3520XD(B)-L/(Y)','recessed',120,2000,424,315,15.5,12.5,2200,1276,1758,1030,53,50,34.5,37.5,'2000x245x233','2050x315x270',3,3.5,'Stainless Steel (PCM)',21),
('00000000-0000-0000-0000-000000000001','FM-4509XD(B)-L/(Y)','recessed',120,900,300,224,19.0,15.5,1400,842,1090,641,48,46,18,19.5,'900x245x233','950x315x270',4,4.5,'Stainless Steel (PCM)',22),
('00000000-0000-0000-0000-000000000001','FM-4510XD(B)-L/(Y)','recessed',120,1000,300,224,19.0,15.5,1400,842,1090,641,48,45,19.3,21,'1000x245x233','1050x315x270',4,4.5,'Stainless Steel (PCM)',23),
('00000000-0000-0000-0000-000000000001','FM-4512XD(B)-L/(Y)','recessed',120,1200,400,310,19.0,15.5,1850,1088,1450,853,49,47,21.5,23.5,'1200x245x233','1250x315x270',4,4.5,'Stainless Steel (PCM)',24),
('00000000-0000-0000-0000-000000000001','FM-4515XD(B)-L/(Y)','recessed',120,1500,500,379,19.0,15.5,2270,1335,1820,1071,52,50,27.5,30,'1500x245x233','1550x315x270',4,4.5,'Stainless Steel (PCM)',25),
('00000000-0000-0000-0000-000000000001','FM-4518XD(B)-L/(Y)','recessed',120,1800,610,480,19.0,15.5,2800,1635,2010,1182,56,54,32,35,'1800x245x233','1850x315x270',4,4.5,'Stainless Steel (PCM)',26),
('00000000-0000-0000-0000-000000000001','FM-4520XD(B)-L/(Y)','recessed',120,2000,610,480,19.0,15.5,2800,1635,2010,1182,56,54,34.5,37.5,'2000x245x233','2050x315x270',4,4.5,'Stainless Steel (PCM)',27),
('00000000-0000-0000-0000-000000000001','FM-5509XD(B)-L/(Y)','recessed',120,900,415,310,22.0,18.5,1550,912,1300,765,52,50,18.5,20,'900x245x233','950x315x270',5,5.5,'Stainless Steel (PCM)',28),
('00000000-0000-0000-0000-000000000001','FM-5510XD(B)-L/(Y)','recessed',120,1000,415,310,22.0,18.5,1550,912,1300,765,52,50,19.8,21.5,'1000x245x233','1050x315x270',5,5.5,'Stainless Steel (PCM)',29),
('00000000-0000-0000-0000-000000000001','FM-5512XD(B)-L/(Y)','recessed',120,1200,520,430,22.0,18.5,1850,1088,1680,988,53,51,22,24,'1200x245x233','1250x315x270',5,5.5,'Stainless Steel (PCM)',30),
('00000000-0000-0000-0000-000000000001','FM-5515XD(B)-L/(Y)','recessed',120,1500,705,534,22.0,18.5,2300,1352,2100,1235,56,53,28,30.5,'1500x245x233','1550x315x270',5,5.5,'Stainless Steel (PCM)',31),
('00000000-0000-0000-0000-000000000001','FM-5518XD(B)-L/(Y)','recessed',120,1800,840,702,22.0,18.5,3240,1905,2400,1411,59,55,32.5,36.0,'1800x245x233','1850x315x270',5,5.5,'Stainless Steel (PCM)',32),
('00000000-0000-0000-0000-000000000001','FM-5520XD(B)-L/(Y)','recessed',120,2000,840,702,22.0,18.5,3240,1905,2400,1411,59,55,35.5,38.5,'2000x245x233','2050x315x270',5,5.5,'Stainless Steel (PCM)',33);