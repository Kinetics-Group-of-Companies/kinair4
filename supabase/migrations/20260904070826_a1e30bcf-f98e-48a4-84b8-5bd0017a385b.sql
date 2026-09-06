CREATE TABLE public.lpo_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  notify_email text,
  lpo_ref text NOT NULL,
  lpo_date date,
  client_name text NOT NULL,
  client_contact text,
  client_email text,
  project_name text,
  material_type text NOT NULL DEFAULT 'OTHER',
  description text,
  quantity integer NOT NULL DEFAULT 1,
  order_value numeric,
  currency text NOT NULL DEFAULT 'AED',
  quoted_lead_time_days integer,
  factory_lead_time_days integer,
  lpo_received_date date,
  advance_payment_date date,
  manufacturing_clearance_date date,
  supplier_name text,
  supplier_po_date date,
  supplier_advance_payment_date date,
  committed_delivery_date date,
  expected_delivery_date date,
  actual_delivery_date date,
  status text NOT NULL DEFAULT 'new',
  next_followup_date date,
  last_followup_date date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_lpo_orders_tenant ON public.lpo_orders(tenant_id);
CREATE INDEX idx_lpo_orders_status ON public.lpo_orders(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lpo_orders TO authenticated;
GRANT ALL ON public.lpo_orders TO service_role;
ALTER TABLE public.lpo_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view LPO orders" ON public.lpo_orders
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can create LPO orders" ON public.lpo_orders
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Tenant users can update LPO orders" ON public.lpo_orders
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can delete LPO orders" ON public.lpo_orders
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER update_lpo_orders_updated_at BEFORE UPDATE ON public.lpo_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lpo_order_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.lpo_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  author_name text,
  note text NOT NULL,
  status_at_time text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_lpo_order_updates_order ON public.lpo_order_updates(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lpo_order_updates TO authenticated;
GRANT ALL ON public.lpo_order_updates TO service_role;
ALTER TABLE public.lpo_order_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view LPO updates" ON public.lpo_order_updates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can add LPO updates" ON public.lpo_order_updates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant users can edit LPO updates" ON public.lpo_order_updates
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can delete LPO updates" ON public.lpo_order_updates
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.lpo_alert_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.lpo_orders(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  alert_type text NOT NULL,
  alert_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_lpo_alert_log_key ON public.lpo_alert_log(alert_key);

GRANT SELECT ON public.lpo_alert_log TO authenticated;
GRANT ALL ON public.lpo_alert_log TO service_role;
ALTER TABLE public.lpo_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can view alert log" ON public.lpo_alert_log
  FOR SELECT TO authenticated
  USING (true);