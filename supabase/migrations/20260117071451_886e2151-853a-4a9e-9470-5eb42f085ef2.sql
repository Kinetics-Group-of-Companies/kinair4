-- Add editable text fields to datasheet_config table
ALTER TABLE public.datasheet_config
ADD COLUMN IF NOT EXISTS section_title_duty_point TEXT DEFAULT 'Duty Point',
ADD COLUMN IF NOT EXISTS section_title_operating_point TEXT DEFAULT 'Operating Point',
ADD COLUMN IF NOT EXISTS section_title_construction TEXT DEFAULT 'Construction',
ADD COLUMN IF NOT EXISTS section_title_motor TEXT DEFAULT 'Motor Characteristics',
ADD COLUMN IF NOT EXISTS section_title_noise TEXT DEFAULT 'Sound Data',
ADD COLUMN IF NOT EXISTS section_title_dimensions TEXT DEFAULT 'Dimensions',
ADD COLUMN IF NOT EXISTS section_title_certifications TEXT DEFAULT 'Certifications',
ADD COLUMN IF NOT EXISTS header_title TEXT DEFAULT 'Technical Datasheet',
ADD COLUMN IF NOT EXISTS standard_notes_text TEXT DEFAULT 'Selections are based on standard air density of 1.2 kg/m³. Performance tested per ISO 5801 / AMCA 210.',
ADD COLUMN IF NOT EXISTS noise_reference_text TEXT DEFAULT 'Sound power levels measured per ISO 13347 / AMCA 300. Values shown at specified distance from fan inlet.',
ADD COLUMN IF NOT EXISTS construction_labels JSONB DEFAULT '{"diameter": "Diameter", "blades": "Blades", "bladeAngle": "Blade Angle", "motorPoles": "Motor Poles", "rpm": "Speed (RPM)", "weight": "Total Weight"}',
ADD COLUMN IF NOT EXISTS duty_point_labels JSONB DEFAULT '{"airflow": "Airflow", "pressure": "Static Pressure", "temperature": "Temperature", "altitude": "Altitude", "density": "Air Density"}',
ADD COLUMN IF NOT EXISTS operating_point_labels JSONB DEFAULT '{"airflow": "Airflow", "staticPressure": "Static Pressure", "dynamicPressure": "Dynamic Pressure", "totalPressure": "Total Pressure", "shaftPower": "Shaft Power", "efficiency": "Efficiency", "outletVelocity": "Outlet Velocity", "sfp": "SFP"}',
ADD COLUMN IF NOT EXISTS motor_labels JSONB DEFAULT '{"brand": "Brand", "frame": "Frame", "power": "Power", "voltage": "Voltage", "frequency": "Frequency", "ratedCurrent": "Rated Current", "fla": "FLA", "lra": "LRA", "ipRating": "IP Rating", "insulation": "Insulation", "efficiency": "Efficiency Class"}';