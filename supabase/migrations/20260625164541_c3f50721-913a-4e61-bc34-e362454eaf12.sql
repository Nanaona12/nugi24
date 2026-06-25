
-- 1. Customer points
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;

-- 2. Subscription period + sane defaults
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS period text NOT NULL DEFAULT 'monthly';
ALTER TABLE public.subscriptions ALTER COLUMN plan SET DEFAULT 'warung';
UPDATE public.subscriptions SET plan = 'warung' WHERE plan NOT IN ('warung','grosir');

-- 3. RPC: tenant info readable by owner & cashier session
CREATE OR REPLACE FUNCTION public.current_tenant_info()
RETURNS TABLE(id uuid, name text, phone text, address text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.phone, t.address
  FROM public.tenants t
  WHERE t.id = public.current_tenant_id()
$$;
REVOKE EXECUTE ON FUNCTION public.current_tenant_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_info() TO authenticated;

-- 4. Trigger: auto add points on new transaction (1 poin per Rp 1.000)
CREATE OR REPLACE FUNCTION public.tg_add_customer_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pts integer;
BEGIN
  IF NEW.customer_phone IS NULL OR length(trim(NEW.customer_phone)) = 0 THEN
    RETURN NEW;
  END IF;
  pts := floor(COALESCE(NEW.total, 0) / 1000)::int;
  IF pts <= 0 THEN RETURN NEW; END IF;
  UPDATE public.customers
    SET points = COALESCE(points, 0) + pts
    WHERE tenant_id = NEW.tenant_id
      AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
        = regexp_replace(NEW.customer_phone, '\D', '', 'g')
      AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') <> '';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_add_customer_points ON public.transactions;
CREATE TRIGGER transactions_add_customer_points
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_add_customer_points();
