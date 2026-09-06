GRANT SELECT ON TABLE public.tenants TO anon;
GRANT SELECT, UPDATE, DELETE ON TABLE public.tenants TO authenticated;
GRANT ALL ON TABLE public.tenants TO service_role;