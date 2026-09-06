-- 1) lpo_alert_log: add tenant scoping and lock down SELECT
ALTER TABLE public.lpo_alert_log ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.lpo_alert_log al
SET tenant_id = o.tenant_id
FROM public.lpo_orders o
WHERE al.order_id = o.id AND al.tenant_id IS NULL;

-- any leftover rows without a matching order fall back to the recipient's tenant
UPDATE public.lpo_alert_log al
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE al.tenant_id IS NULL AND p.email = al.recipient_email;

DROP POLICY IF EXISTS "Signed in users can view alert log" ON public.lpo_alert_log;
CREATE POLICY "Tenant users can view own alert log"
ON public.lpo_alert_log FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- inserts happen via the alerts edge function (service role, bypasses RLS);
-- keep an authenticated insert policy tenant-scoped in case of direct inserts
DROP POLICY IF EXISTS "Signed in users can add alert log" ON public.lpo_alert_log;
CREATE POLICY "Tenant users can add own alert log"
ON public.lpo_alert_log FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 2) lpo-documents bucket: scope every operation to the tenant folder in the path
-- path layout: <tenant_id>/<order_id>/<file>
DROP POLICY IF EXISTS "Signed-in users can read LPO documents" ON storage.objects;
DROP POLICY IF EXISTS "Signed-in users can upload LPO documents" ON storage.objects;
DROP POLICY IF EXISTS "Signed-in users can update LPO documents" ON storage.objects;
DROP POLICY IF EXISTS "Signed-in users can delete LPO documents" ON storage.objects;

CREATE POLICY "Tenant users can read own LPO documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lpo-documents'
  AND (
    (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    OR public.is_super_admin(auth.uid())
  )
);

CREATE POLICY "Tenant users can upload own LPO documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lpo-documents'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

CREATE POLICY "Tenant users can update own LPO documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'lpo-documents'
  AND (
    (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    OR public.is_super_admin(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'lpo-documents'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

CREATE POLICY "Tenant users can delete own LPO documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'lpo-documents'
  AND (
    (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    OR public.is_super_admin(auth.uid())
  )
);