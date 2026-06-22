
DO $$
DECLARE
  uids uuid[] := ARRAY['04361402-9052-421f-919c-719feb017d89','7d1e4ab5-8061-4db1-bef8-7c3e636eb5d0','16ad5ec0-e945-4c2f-8ffe-e65b7112502d']::uuid[];
  tids uuid[];
BEGIN
  SELECT array_agg(id) INTO tids FROM public.tenants WHERE owner_user_id = ANY(uids);

  IF tids IS NOT NULL THEN
    DELETE FROM public.transaction_items WHERE tenant_id = ANY(tids);
    DELETE FROM public.transactions WHERE tenant_id = ANY(tids);
    DELETE FROM public.purchase_order_items WHERE tenant_id = ANY(tids);
    DELETE FROM public.purchase_orders WHERE tenant_id = ANY(tids);
    DELETE FROM public.product_price_tiers WHERE tenant_id = ANY(tids);
    DELETE FROM public.product_units WHERE tenant_id = ANY(tids);
    DELETE FROM public.products WHERE tenant_id = ANY(tids);
    DELETE FROM public.payments WHERE tenant_id = ANY(tids);
    DELETE FROM public.subscriptions WHERE tenant_id = ANY(tids);
    DELETE FROM public.tenants WHERE id = ANY(tids);
  END IF;

  DELETE FROM public.user_roles WHERE user_id = ANY(uids);
  DELETE FROM auth.users WHERE id = ANY(uids);
END $$;
