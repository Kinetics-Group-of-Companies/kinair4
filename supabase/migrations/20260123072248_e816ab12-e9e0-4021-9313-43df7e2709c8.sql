-- Update the handle_new_user function to set a 30-day default subscription for new users
-- This prevents new users from getting unlimited access by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_tenant_id uuid;
BEGIN
  -- Create a new tenant for this user with 30-day default subscription
  INSERT INTO public.tenants (name, email, is_active, subscription_start, subscription_end)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 
    NEW.email, 
    true,
    NOW(),
    NOW() + INTERVAL '30 days'
  )
  RETURNING id INTO new_tenant_id;
  
  -- Create the user profile linked to the new tenant
  INSERT INTO public.profiles (user_id, tenant_id, display_name, email, is_approved, approval_requested_at)
  VALUES (
    NEW.id, 
    new_tenant_id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    false,
    NOW()
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$function$;