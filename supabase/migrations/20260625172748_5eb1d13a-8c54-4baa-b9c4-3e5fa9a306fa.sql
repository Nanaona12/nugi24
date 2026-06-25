GRANT SELECT, UPDATE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_info() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cashier_session() TO authenticated;