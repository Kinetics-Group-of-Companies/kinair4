-- Add unique constraint on user_id for user_roles table to allow upsert
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);