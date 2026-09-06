-- 1. New order fields
ALTER TABLE public.lpo_orders
  ADD COLUMN IF NOT EXISTS quotation_ref text,
  ADD COLUMN IF NOT EXISTS quotation_date date,
  ADD COLUMN IF NOT EXISTS pi_number text,
  ADD COLUMN IF NOT EXISTS pi_sent_date date,
  ADD COLUMN IF NOT EXISTS order_ack_sent_date date,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS supplier_payment_terms text,
  ADD COLUMN IF NOT EXISTS warranty_terms text,
  ADD COLUMN IF NOT EXISTS warranty_months integer,
  ADD COLUMN IF NOT EXISTS warranty_end_date date,
  ADD COLUMN IF NOT EXISTS vat_percent numeric,
  ADD COLUMN IF NOT EXISTS vat_amount numeric,
  ADD COLUMN IF NOT EXISTS delivery_terms text,
  ADD COLUMN IF NOT EXISTS delivery_location text,
  ADD COLUMN IF NOT EXISTS retention_percent numeric,
  ADD COLUMN IF NOT EXISTS retention_release_date date,
  ADD COLUMN IF NOT EXISTS advance_amount numeric,
  ADD COLUMN IF NOT EXISTS advance_received_amount numeric,
  ADD COLUMN IF NOT EXISTS balance_amount numeric,
  ADD COLUMN IF NOT EXISTS balance_received_amount numeric,
  ADD COLUMN IF NOT EXISTS supplier_order_value numeric,
  ADD COLUMN IF NOT EXISTS supplier_advance_percent numeric,
  ADD COLUMN IF NOT EXISTS supplier_advance_amount numeric,
  ADD COLUMN IF NOT EXISTS supplier_balance_amount numeric,
  ADD COLUMN IF NOT EXISTS supplier_balance_payment_date date;

-- 2. Contacts address book
CREATE TABLE IF NOT EXISTS public.lpo_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('customer','supplier')),
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  trn text,
  payment_terms text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lpo_contacts_unique_name
  ON public.lpo_contacts (tenant_id, contact_type, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lpo_contacts TO authenticated;
GRANT ALL ON public.lpo_contacts TO service_role;

ALTER TABLE public.lpo_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view contacts" ON public.lpo_contacts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can create contacts" ON public.lpo_contacts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant users can update contacts" ON public.lpo_contacts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can delete contacts" ON public.lpo_contacts
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER update_lpo_contacts_updated_at
  BEFORE UPDATE ON public.lpo_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Order documents
CREATE TABLE IF NOT EXISTS public.lpo_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.lpo_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  uploaded_by_name text,
  doc_type text NOT NULL DEFAULT 'other',
  title text,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lpo_documents_order_idx ON public.lpo_documents (order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lpo_documents TO authenticated;
GRANT ALL ON public.lpo_documents TO service_role;

ALTER TABLE public.lpo_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view LPO documents" ON public.lpo_documents
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can add LPO documents" ON public.lpo_documents
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant users can update LPO documents" ON public.lpo_documents
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant users can delete LPO documents" ON public.lpo_documents
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- 4. Monthly purge of delivered orders older than two years
SELECT cron.schedule(
  'lpo-purge-delivered-2y',
  '0 2 1 * *',
  $$
  DELETE FROM public.lpo_orders
  WHERE COALESCE(actual_delivery_date, site_delivery_date) IS NOT NULL
    AND COALESCE(actual_delivery_date, site_delivery_date) < (CURRENT_DATE - INTERVAL '2 years');
  $$
);