-- Add QR code visibility options to datasheet_config
ALTER TABLE public.datasheet_config 
ADD COLUMN IF NOT EXISTS show_catalogue_qr boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_iom_qr boolean DEFAULT true;

-- Add EU Noise Directive text field
ALTER TABLE public.datasheet_config 
ADD COLUMN IF NOT EXISTS noise_directive_text text DEFAULT 'In accordance with EU Directive 2006/42/EC and EN ISO 3744. Sound power level measured at free-field conditions.';

-- Add comments
COMMENT ON COLUMN public.datasheet_config.show_catalogue_qr IS 'Show/hide catalogue QR code on datasheet';
COMMENT ON COLUMN public.datasheet_config.show_iom_qr IS 'Show/hide IOM manual QR code on datasheet';
COMMENT ON COLUMN public.datasheet_config.noise_directive_text IS 'EU Noise Directive compliance text shown on datasheet';