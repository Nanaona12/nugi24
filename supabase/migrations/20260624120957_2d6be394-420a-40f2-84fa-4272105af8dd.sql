
-- 1) Set search_path on remaining mutable functions
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.generate_cashier_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
  ok boolean := false;
BEGIN
  WHILE NOT ok LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    PERFORM 1 FROM public.tenants WHERE cashier_code = code;
    IF NOT FOUND THEN ok := true; END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- 2) Deterministic tenant resolution: prefer owner, then cashier mapping
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tid FROM (
    SELECT id AS tid, 1 AS priority FROM public.tenants WHERE owner_user_id = auth.uid()
    UNION ALL
    SELECT tenant_id AS tid, 2 AS priority FROM public.tenant_cashier_users WHERE user_id = auth.uid()
  ) s
  ORDER BY priority ASC
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;

-- 3) Restrict cashier session product writes to stock-only via a stricter UPDATE policy.
--    Owners keep full update; cashier sessions can no longer touch products directly.
DROP POLICY IF EXISTS "tenant update products" ON public.products;
CREATE POLICY "owner update products"
  ON public.products
  FOR UPDATE
  USING (
    (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- 4) Column-level lockdown: hide cashier PIN hashes and shared cashier auth password from the
--    Data API. Server functions that need them use the service role client.
REVOKE SELECT ON public.cashiers FROM authenticated, anon;
GRANT SELECT (id, tenant_id, name, active, created_at, updated_at) ON public.cashiers TO authenticated;

REVOKE SELECT ON public.tenants FROM authenticated, anon;
GRANT SELECT (
  id, owner_user_id, name, cashier_code, cashier_auth_user_id, created_at, updated_at
) ON public.tenants TO authenticated;
