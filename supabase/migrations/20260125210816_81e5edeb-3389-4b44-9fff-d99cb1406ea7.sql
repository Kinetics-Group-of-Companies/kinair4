
-- Drop and recreate is_super_admin function to use profiles table instead of auth.users
-- This allows migrated users to retain super admin status

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id 
    AND email IN ('chndeepak7@gmail.com', 'deepak@kineticsgroup.ae')
  )
$$;
