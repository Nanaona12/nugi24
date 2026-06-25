
-- Revoke EXECUTE from anon/public on SECURITY DEFINER functions; grant only to roles that need it.

-- Trigger functions (only invoked by triggers; no role needs EXECUTE)
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hw_reduce_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_tenants_set_cashier_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fefo_deduct_batches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_add_customer_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_cashier_code() FROM PUBLIC, anon, authenticated;

-- RLS helpers used via policies (need authenticated; not anon)
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_cashier_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cashier_session() TO authenticated;

REVOKE ALL ON FUNCTION public.current_tenant_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_info() TO authenticated;

REVOKE ALL ON FUNCTION public.next_product_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_product_code() TO authenticated;
