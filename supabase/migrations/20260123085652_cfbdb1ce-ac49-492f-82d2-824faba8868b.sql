-- Add unit preference columns to project_items
ALTER TABLE public.project_items 
ADD COLUMN airflow_unit text DEFAULT 'CMH',
ADD COLUMN pressure_unit text DEFAULT 'Pa';