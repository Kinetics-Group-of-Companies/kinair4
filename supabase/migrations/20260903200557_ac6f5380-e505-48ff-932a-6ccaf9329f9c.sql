-- Remove all anon privileges on software_releases (downloads require sign-in)
REVOKE ALL ON public.software_releases FROM anon;
-- Ensure authenticated has only what it needs; writes gated by super-admin policy
GRANT SELECT ON public.software_releases TO authenticated;