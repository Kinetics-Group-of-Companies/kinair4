-- Add total_efficiency column to performance_data table
ALTER TABLE public.performance_data 
ADD COLUMN total_efficiency numeric DEFAULT 0;