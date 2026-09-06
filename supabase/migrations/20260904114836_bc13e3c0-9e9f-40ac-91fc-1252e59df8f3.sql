DROP POLICY IF EXISTS "Tenant users can delete LPO orders" ON public.lpo_orders;
CREATE POLICY "Admins can delete LPO orders" ON public.lpo_orders
  FOR DELETE TO authenticated
  USING ((tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin(auth.uid()));