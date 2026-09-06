ALTER TABLE public.lpo_orders
  ADD COLUMN IF NOT EXISTS baseline_committed_date date,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS order_owner text,
  ADD COLUMN IF NOT EXISTS delay_reason text,
  ADD COLUMN IF NOT EXISTS delay_owner text,
  ADD COLUMN IF NOT EXISTS production_start_date date,
  ADD COLUMN IF NOT EXISTS inspection_date date,
  ADD COLUMN IF NOT EXISTS ready_date date,
  ADD COLUMN IF NOT EXISTS dispatch_date date,
  ADD COLUMN IF NOT EXISTS transport_mode text,
  ADD COLUMN IF NOT EXISTS shipment_ref text,
  ADD COLUMN IF NOT EXISTS port_eta_date date,
  ADD COLUMN IF NOT EXISTS customs_clearance_date date,
  ADD COLUMN IF NOT EXISTS site_delivery_date date,
  ADD COLUMN IF NOT EXISTS installation_date date,
  ADD COLUMN IF NOT EXISTS advance_percent numeric,
  ADD COLUMN IF NOT EXISTS balance_payment_date date,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS warranty_start_date date;

CREATE TABLE IF NOT EXISTS public.lpo_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.lpo_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid,
  author_name text,
  revision_no integer NOT NULL DEFAULT 1,
  revised_lpo_ref text,
  revised_lpo_date date,
  revised_lpo_received_date date,
  revised_order_value numeric,
  revised_lead_time_weeks_min integer,
  revised_lead_time_weeks_max integer,
  revised_committed_date date,
  previous_committed_date date,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lpo_revisions TO authenticated;
GRANT ALL ON public.lpo_revisions TO service_role;
ALTER TABLE public.lpo_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view LPO revisions" ON public.lpo_revisions
  FOR SELECT TO authenticated
  USING ((tenant_id = public.get_user_tenant_id(auth.uid())) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can add LPO revisions" ON public.lpo_revisions
  FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can edit LPO revisions" ON public.lpo_revisions
  FOR UPDATE TO authenticated
  USING ((tenant_id = public.get_user_tenant_id(auth.uid())) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can delete LPO revisions" ON public.lpo_revisions
  FOR DELETE TO authenticated
  USING ((tenant_id = public.get_user_tenant_id(auth.uid())) OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS lpo_revisions_order_idx ON public.lpo_revisions(order_id);