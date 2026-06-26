
DROP POLICY IF EXISTS "tenant insert transactions" ON public.transactions;
CREATE POLICY "tenant insert transactions" ON public.transactions
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND (
    cashier_id IS NULL
    OR EXISTS (SELECT 1 FROM public.cashiers c WHERE c.id = cashier_id AND c.tenant_id = public.current_tenant_id())
  )
);

DROP POLICY IF EXISTS "tenant insert refunds" ON public.refunds;
CREATE POLICY "tenant insert refunds" ON public.refunds
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND (
    cashier_id IS NULL
    OR EXISTS (SELECT 1 FROM public.cashiers c WHERE c.id = cashier_id AND c.tenant_id = public.current_tenant_id())
  )
);
