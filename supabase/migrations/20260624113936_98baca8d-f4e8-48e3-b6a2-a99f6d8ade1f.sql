
REVOKE EXECUTE ON FUNCTION public.hw_reduce_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_tenants_set_cashier_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fefo_deduct_batches() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_cashier_session() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_product_code() FROM PUBLIC, anon;
