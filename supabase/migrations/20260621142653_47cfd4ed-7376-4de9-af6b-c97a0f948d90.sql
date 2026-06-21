
-- =========================================================
-- 1. ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('super_admin');
CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','expired');

-- =========================================================
-- 2. TENANTS
-- =========================================================
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 3. USER ROLES
-- =========================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user can read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- =========================================================
-- 4. CURRENT TENANT HELPER
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE owner_user_id = auth.uid() LIMIT 1
$$;

-- =========================================================
-- 5. TENANTS RLS
-- =========================================================
CREATE POLICY "owner reads own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "owner updates own tenant" ON public.tenants FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
-- tenants created via trigger (service_role); no INSERT policy for users

-- =========================================================
-- 6. SUBSCRIPTIONS
-- =========================================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  plan text NOT NULL DEFAULT 'basic',
  price_idr integer NOT NULL DEFAULT 14900,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "tenant reads own subscription" ON public.subscriptions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));

-- =========================================================
-- 7. PAYMENTS
-- =========================================================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  midtrans_order_id text UNIQUE,
  midtrans_transaction_id text,
  snap_token text,
  payment_type text,
  raw_response jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX payments_tenant_idx ON public.payments(tenant_id, created_at DESC);

CREATE POLICY "tenant reads own payments" ON public.payments FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));

-- =========================================================
-- 8. SIGNUP HOOK — auto create tenant + subscription + super_admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id uuid;
  v_name text;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'shop_name',
                     NEW.raw_user_meta_data->>'name',
                     split_part(NEW.email,'@',1));

  INSERT INTO public.tenants (owner_user_id, name)
  VALUES (NEW.id, v_name)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.subscriptions (tenant_id) VALUES (v_tenant_id);

  IF lower(NEW.email) = 'sugarpies1211@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- 9. BACKFILL: create tenant for admin@gmail.com & assign existing data
-- =========================================================
DO $$
DECLARE
  v_admin_id uuid;
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@gmail.com' LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.tenants (owner_user_id, name)
    VALUES (v_admin_id, 'Toko Utama')
    ON CONFLICT (owner_user_id) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_tenant_id;

    INSERT INTO public.subscriptions (tenant_id, status, current_period_end)
    VALUES (v_tenant_id, 'active', now() + interval '100 years')
    ON CONFLICT (tenant_id) DO UPDATE SET status='active', current_period_end = now() + interval '100 years';
  END IF;
END $$;

-- =========================================================
-- 10. ADD tenant_id TO DATA TABLES
-- =========================================================
ALTER TABLE public.products            ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.product_units       ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.product_price_tiers ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.transactions        ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_items   ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders     ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_order_items ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Backfill all to admin tenant
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT t.id INTO v_tenant_id
  FROM public.tenants t JOIN auth.users u ON u.id = t.owner_user_id
  WHERE u.email='admin@gmail.com' LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    UPDATE public.products            SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.product_units       SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.product_price_tiers SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.transactions        SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.transaction_items   SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.purchase_orders     SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.purchase_order_items SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  ELSE
    -- no admin user yet: just delete orphan data
    DELETE FROM public.transaction_items;
    DELETE FROM public.transactions;
    DELETE FROM public.purchase_order_items;
    DELETE FROM public.purchase_orders;
    DELETE FROM public.product_price_tiers;
    DELETE FROM public.product_units;
    DELETE FROM public.products;
  END IF;
END $$;

-- Set NOT NULL + default
ALTER TABLE public.products            ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.product_units       ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.product_price_tiers ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.transactions        ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.transaction_items   ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.purchase_orders     ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.purchase_order_items ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();

CREATE INDEX products_tenant_idx            ON public.products(tenant_id);
CREATE INDEX product_units_tenant_idx       ON public.product_units(tenant_id);
CREATE INDEX product_price_tiers_tenant_idx ON public.product_price_tiers(tenant_id);
CREATE INDEX transactions_tenant_idx        ON public.transactions(tenant_id, created_at DESC);
CREATE INDEX transaction_items_tenant_idx   ON public.transaction_items(tenant_id);
CREATE INDEX purchase_orders_tenant_idx     ON public.purchase_orders(tenant_id);
CREATE INDEX purchase_order_items_tenant_idx ON public.purchase_order_items(tenant_id);

-- =========================================================
-- 11. REPLACE RLS POLICIES (tenant-scoped + super_admin read)
-- =========================================================

-- products
DROP POLICY IF EXISTS "Authenticated can read products"   ON public.products;
DROP POLICY IF EXISTS "Authenticated can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can delete products" ON public.products;
CREATE POLICY "tenant read products"   ON public.products FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update products" ON public.products FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete products" ON public.products FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- product_units
DROP POLICY IF EXISTS "auth read product_units"   ON public.product_units;
DROP POLICY IF EXISTS "auth insert product_units" ON public.product_units;
DROP POLICY IF EXISTS "auth update product_units" ON public.product_units;
DROP POLICY IF EXISTS "auth delete product_units" ON public.product_units;
CREATE POLICY "tenant read units"   ON public.product_units FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant insert units" ON public.product_units FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update units" ON public.product_units FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete units" ON public.product_units FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- product_price_tiers
DROP POLICY IF EXISTS "auth read tiers"   ON public.product_price_tiers;
DROP POLICY IF EXISTS "auth insert tiers" ON public.product_price_tiers;
DROP POLICY IF EXISTS "auth update tiers" ON public.product_price_tiers;
DROP POLICY IF EXISTS "auth delete tiers" ON public.product_price_tiers;
CREATE POLICY "tenant read tiers"   ON public.product_price_tiers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant insert tiers" ON public.product_price_tiers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update tiers" ON public.product_price_tiers FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete tiers" ON public.product_price_tiers FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- transactions
DROP POLICY IF EXISTS "Authenticated can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Owners can read own transactions"          ON public.transactions;
DROP POLICY IF EXISTS "Owners can delete own transactions"        ON public.transactions;
CREATE POLICY "tenant read transactions"   ON public.transactions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant insert transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND cashier_id = auth.uid());
CREATE POLICY "tenant update transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete transactions" ON public.transactions FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- transaction_items
DROP POLICY IF EXISTS "Owners can read own tx items"   ON public.transaction_items;
DROP POLICY IF EXISTS "Owners can insert own tx items" ON public.transaction_items;
DROP POLICY IF EXISTS "Owners can delete own tx items" ON public.transaction_items;
CREATE POLICY "tenant read tx items"   ON public.transaction_items FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant insert tx items" ON public.transaction_items FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update tx items" ON public.transaction_items FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete tx items" ON public.transaction_items FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- purchase_orders
DROP POLICY IF EXISTS "Auth insert own POs"        ON public.purchase_orders;
DROP POLICY IF EXISTS "Owners can read own POs"    ON public.purchase_orders;
DROP POLICY IF EXISTS "Owners can update own POs"  ON public.purchase_orders;
DROP POLICY IF EXISTS "Owners can delete own POs"  ON public.purchase_orders;
CREATE POLICY "tenant read POs"   ON public.purchase_orders FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant insert POs" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND user_id = auth.uid());
CREATE POLICY "tenant update POs" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete POs" ON public.purchase_orders FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- purchase_order_items
DROP POLICY IF EXISTS "Owners can read own PO items"   ON public.purchase_order_items;
DROP POLICY IF EXISTS "Owners can insert own PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Owners can update own PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Owners can delete own PO items" ON public.purchase_order_items;
CREATE POLICY "tenant read PO items"   ON public.purchase_order_items FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tenant insert PO items" ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update PO items" ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete PO items" ON public.purchase_order_items FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());
