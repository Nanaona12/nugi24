CREATE TABLE public.loyalty_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  reward_cap_percent numeric NOT NULL DEFAULT 5,
  silver_min numeric NOT NULL DEFAULT 100000,
  gold_min numeric NOT NULL DEFAULT 300000,
  platinum_min numeric NOT NULL DEFAULT 750000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.loyalty_settings TO authenticated;
GRANT ALL ON public.loyalty_settings TO service_role;
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages loyalty settings" ON public.loyalty_settings FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session())
  WITH CHECK (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session());

CREATE TABLE public.customer_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('voucher','product','cash')),
  description text,
  amount numeric NOT NULL CHECK (amount >= 0),
  points_used integer NOT NULL DEFAULT 0 CHECK (points_used >= 0),
  bookkeeping_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_rewards_tenant_idx ON public.customer_rewards(tenant_id, created_at DESC);
GRANT SELECT, INSERT ON public.customer_rewards TO authenticated;
GRANT ALL ON public.customer_rewards TO service_role;
ALTER TABLE public.customer_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads rewards" ON public.customer_rewards FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session());
CREATE POLICY "owner gives rewards" ON public.customer_rewards FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session());

CREATE OR REPLACE FUNCTION public.tg_customer_reward_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur_pts integer; eid uuid;
BEGIN
  NEW.created_by := auth.uid();
  IF NEW.customer_id IS NOT NULL AND NEW.points_used > 0 THEN
    SELECT points INTO cur_pts FROM customers WHERE id = NEW.customer_id AND tenant_id = NEW.tenant_id FOR UPDATE;
    IF cur_pts IS NULL THEN RAISE EXCEPTION 'Pelanggan tidak ditemukan'; END IF;
    IF cur_pts < NEW.points_used THEN RAISE EXCEPTION 'Poin pelanggan tidak cukup'; END IF;
    UPDATE customers SET points = points - NEW.points_used WHERE id = NEW.customer_id;
  END IF;
  -- Voucher & uang tunai keluar dari kas; produk bonus hanya biaya (stok), tidak keluar kas.
  IF NEW.reward_type IN ('voucher','cash') AND NEW.amount > 0 THEN
    INSERT INTO bookkeeping_entries(tenant_id, entry_date, kind, description, ref, amount, created_by)
    VALUES (NEW.tenant_id, now(), 'out', 'Biaya loyalitas pelanggan: ' || NEW.customer_name || COALESCE(' - ' || NEW.description, ''), 'loyalty_reward', NEW.amount, auth.uid())
    RETURNING id INTO eid;
    NEW.bookkeeping_entry_id := eid;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_reward_apply BEFORE INSERT ON public.customer_rewards
FOR EACH ROW EXECUTE FUNCTION public.tg_customer_reward_apply();