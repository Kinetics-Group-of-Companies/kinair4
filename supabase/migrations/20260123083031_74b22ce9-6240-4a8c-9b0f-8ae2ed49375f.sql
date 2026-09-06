-- Add datasheet_url column to store generated PDF for each project item
ALTER TABLE public.project_items 
ADD COLUMN datasheet_url text;