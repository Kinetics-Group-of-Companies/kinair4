-- Allow admins to view all profiles (for user management)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow admins to update profiles (for approving users)
CREATE POLICY "Admins can update profiles for approval"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow admins to delete profiles (for rejecting pending users)
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow admins to view all tenants (for user management)
CREATE POLICY "Admins can view all tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow admins to update all tenants (for subscription management)
CREATE POLICY "Admins can update all tenants"
ON public.tenants
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow admins to delete tenants (for removing rejected users)
CREATE POLICY "Admins can delete tenants"
ON public.tenants
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));