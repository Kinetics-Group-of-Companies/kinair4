-- Add factory_address column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN factory_address TEXT;