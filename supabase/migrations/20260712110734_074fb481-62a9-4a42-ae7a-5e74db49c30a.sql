
-- ========== debts ==========
CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  debtor_name text NOT NULL,
  debtor_phone text,
  debtor_type text NOT NULL DEFAULT 'customer' CHECK (debtor_type IN ('customer','employee')),
  original_amount numeric NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
  paid_amount numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid')),
  note text,
  cashier_id uuid REFERENCES public.cashiers(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO authenticated;
GRANT ALL ON public.debts TO service_role;

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read debts" ON public.debts
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant members insert debts" ON public.debts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant members update debts" ON public.debts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant owner delete debts" ON public.debts
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session());

CREATE INDEX debts_tenant_status_idx ON public.debts(tenant_id, status, created_at DESC);
CREATE INDEX debts_customer_idx ON public.debts(customer_id);

CREATE TRIGGER trg_debts_updated
  BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ========== debt_payments ==========
CREATE TABLE public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','qris','transfer','other')),
  note text,
  shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.debt_payments TO authenticated;
GRANT ALL ON public.debt_payments TO service_role;

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read debt_payments" ON public.debt_payments
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant members insert debt_payments" ON public.debt_payments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant owner delete debt_payments" ON public.debt_payments
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND NOT public.is_cashier_session());

CREATE INDEX debt_payments_debt_idx ON public.debt_payments(debt_id, created_at);

-- Trigger: recompute paid_amount + status on debt when payment inserted/deleted
CREATE OR REPLACE FUNCTION public.tg_debt_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debt uuid;
  v_total numeric;
  v_original numeric;
BEGIN
  v_debt := COALESCE(NEW.debt_id, OLD.debt_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM public.debt_payments WHERE debt_id = v_debt;
  SELECT original_amount INTO v_original FROM public.debts WHERE id = v_debt;
  UPDATE public.debts
    SET paid_amount = v_total,
        status = CASE WHEN v_total >= v_original AND v_original > 0 THEN 'paid' ELSE 'open' END,
        updated_at = now()
    WHERE id = v_debt;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_debt_payments_recalc
  AFTER INSERT OR DELETE ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_debt_recalc();

-- Bookkeeping auto-log
CREATE OR REPLACE FUNCTION public.tg_debt_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kasbon barang = kas keluar (piutang bertambah)
  INSERT INTO public.bookkeeping_entries (tenant_id, entry_date, kind, description, ref, amount)
  VALUES (NEW.tenant_id, NEW.created_at, 'out',
          'Kasbon: ' || NEW.debtor_name || COALESCE(' (' || NEW.note || ')',''),
          NEW.id::text, NEW.original_amount);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_debts_bookkeeping
  AFTER INSERT ON public.debts
  FOR EACH ROW WHEN (NEW.original_amount > 0)
  EXECUTE FUNCTION public.tg_debt_bookkeeping();

CREATE OR REPLACE FUNCTION public.tg_debt_payment_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT debtor_name INTO v_name FROM public.debts WHERE id = NEW.debt_id;
  INSERT INTO public.bookkeeping_entries (tenant_id, entry_date, kind, description, ref, amount)
  VALUES (NEW.tenant_id, NEW.created_at, 'in',
          'Bayar hutang: ' || COALESCE(v_name,'') ||
          ' (' || upper(NEW.method) || ')' ||
          COALESCE(' - ' || NEW.note,''),
          NEW.debt_id::text, NEW.amount);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_debt_payments_bookkeeping
  AFTER INSERT ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_debt_payment_bookkeeping();

-- Realtime
ALTER TABLE public.debts REPLICA IDENTITY FULL;
ALTER TABLE public.debt_payments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debt_payments;
