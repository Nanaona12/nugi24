ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS qris_amount integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.tenant_qris_month_usage(_tenant uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(qris_amount), 0)::int
  FROM public.transactions
  WHERE tenant_id = _tenant
    AND created_at >= date_trunc('month', now());
$$;

REVOKE ALL ON FUNCTION public.tenant_qris_month_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_qris_month_usage(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_qris_month_usage(uuid) TO authenticated;