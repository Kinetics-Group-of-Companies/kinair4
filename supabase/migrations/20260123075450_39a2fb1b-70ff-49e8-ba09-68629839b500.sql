-- Add RLS policies for super admins to manage user_roles
CREATE POLICY "Super admins can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update roles" 
ON public.user_roles 
FOR UPDATE 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete roles" 
ON public.user_roles 
FOR DELETE 
USING (is_super_admin(auth.uid()));