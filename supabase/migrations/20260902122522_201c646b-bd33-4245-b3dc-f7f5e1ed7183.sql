ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS supplier_invoice_no text;

CREATE TABLE public.supplier_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier text NOT NULL,
  invoice_no text,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_debts TO authenticated;
GRANT ALL ON public.supplier_debts TO service_role;
ALTER TABLE public.supplier_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant manage supplier debts" ON public.supplier_debts
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TABLE public.supplier_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES public.supplier_debts(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_debt_payments TO authenticated;
GRANT ALL ON public.supplier_debt_payments TO service_role;
ALTER TABLE public.supplier_debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant manage supplier debt payments" ON public.supplier_debt_payments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE INDEX idx_supplier_debts_tenant ON public.supplier_debts(tenant_id, status, due_date);
CREATE INDEX idx_supplier_debt_payments_debt ON public.supplier_debt_payments(debt_id);

CREATE TRIGGER trg_supplier_debts_updated
  BEFORE UPDATE ON public.supplier_debts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_supplier_debt_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_debt uuid;
  v_total numeric;
  v_original numeric;
BEGIN
  v_debt := COALESCE(NEW.debt_id, OLD.debt_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM public.supplier_debt_payments WHERE debt_id = v_debt;
  SELECT total INTO v_original FROM public.supplier_debts WHERE id = v_debt;
  UPDATE public.supplier_debts
    SET paid_amount = v_total,
        status = CASE
          WHEN v_total >= v_original AND v_original > 0 THEN 'paid'
          WHEN v_total > 0 THEN 'partial'
          ELSE 'open' END,
        updated_at = now()
    WHERE id = v_debt;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_supplier_debt_payments_recalc
  AFTER INSERT OR DELETE ON public.supplier_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_supplier_debt_recalc();

CREATE OR REPLACE FUNCTION public.tg_supplier_debt_payment_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supplier text;
  v_invoice text;
BEGIN
  SELECT supplier, invoice_no INTO v_supplier, v_invoice FROM public.supplier_debts WHERE id = NEW.debt_id;
  INSERT INTO public.bookkeeping_entries (tenant_id, entry_date, kind, description, ref, amount)
  VALUES (NEW.tenant_id, NEW.created_at, 'out',
          'Bayar hutang supplier: ' || COALESCE(v_supplier, '') ||
          COALESCE(' (Faktur ' || v_invoice || ')', '') ||
          ' [' || upper(NEW.method) || ']' ||
          COALESCE(' - ' || NEW.note, ''),
          NEW.debt_id::text, NEW.amount);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_debt_payments_bookkeeping
  AFTER INSERT ON public.supplier_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_supplier_debt_payment_bookkeeping();

REVOKE EXECUTE ON FUNCTION public.tg_supplier_debt_recalc() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_supplier_debt_payment_bookkeeping() FROM PUBLIC, anon;