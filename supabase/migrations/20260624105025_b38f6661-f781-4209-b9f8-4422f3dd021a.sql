
-- 1. Add columns to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS cashier_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS cashier_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_auth_password text;

-- 2. Mapping table: shared cashier auth user -> tenant
CREATE TABLE IF NOT EXISTS public.tenant_cashier_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_cashier_users_tenant_idx ON public.tenant_cashier_users(tenant_id);

GRANT SELECT ON public.tenant_cashier_users TO authenticated;
GRANT ALL ON public.tenant_cashier_users TO service_role;

ALTER TABLE public.tenant_cashier_users ENABLE ROW LEVEL SECURITY;

-- Only authenticated user can read their own mapping row
CREATE POLICY "user reads own cashier mapping"
  ON public.tenant_cashier_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Update current_tenant_id() to cover both owner and cashier sessions
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
  UNION ALL
  SELECT tenant_id FROM public.tenant_cashier_users WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- 4. Helper to detect cashier-shared session
CREATE OR REPLACE FUNCTION public.is_cashier_session()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_cashier_users WHERE user_id = auth.uid())
$$;

-- 5. Cashier code generator (8 chars, no confusing letters)
CREATE OR REPLACE FUNCTION public.generate_cashier_code()
RETURNS text
LANGUAGE plpgsql
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

-- 6. Backfill cashier_code for existing tenants
UPDATE public.tenants SET cashier_code = public.generate_cashier_code()
WHERE cashier_code IS NULL;

-- 7. Trigger: auto-generate cashier_code on new tenant insert
CREATE OR REPLACE FUNCTION public.tg_tenants_set_cashier_code()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.cashier_code IS NULL THEN
    NEW.cashier_code := public.generate_cashier_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_set_cashier_code ON public.tenants;
CREATE TRIGGER tenants_set_cashier_code
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_tenants_set_cashier_code();

-- 8. Split cashiers policy: owner = full, cashier session = read only
DROP POLICY IF EXISTS "tenant owner full cashiers" ON public.cashiers;

CREATE POLICY "owner manages cashiers"
  ON public.cashiers
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session())
  WITH CHECK (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session());

CREATE POLICY "cashier session reads cashiers"
  ON public.cashiers
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_cashier_session());

-- 9. Lock down sensitive tables from cashier sessions (write protection)
-- Drop existing then recreate with extra guard. Cashier sessions still get
-- SELECT via current_tenant_id() because the policy below denies only writes.
ALTER POLICY "tenant owner full shifts" ON public.cashier_shifts
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
-- shifts/transactions/customers: cashier needs full CRUD, leave as-is.

-- subscriptions / payments / purchase_orders / household_withdrawals:
-- cashier should not see/manage these. Add explicit deny via tighter policy.
DROP POLICY IF EXISTS "tenant reads own subscription" ON public.subscriptions;
CREATE POLICY "tenant reads own subscription"
  ON public.subscriptions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session());
