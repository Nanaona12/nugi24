
-- Cashiers per tenant
CREATE TABLE IF NOT EXISTS public.cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  pin_hash text NOT NULL,
  pin_salt text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cashiers_tenant_active_idx ON public.cashiers (tenant_id, active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashiers TO authenticated;
GRANT ALL ON public.cashiers TO service_role;
ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant owner full cashiers"
  ON public.cashiers FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE TRIGGER trg_cashiers_updated
  BEFORE UPDATE ON public.cashiers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Cashier shifts
CREATE TABLE IF NOT EXISTS public.cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cashier_id uuid NOT NULL REFERENCES public.cashiers(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  actual_cash numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  total_sales numeric NOT NULL DEFAULT 0,
  total_cash numeric NOT NULL DEFAULT 0,
  total_qris numeric NOT NULL DEFAULT 0,
  total_other numeric NOT NULL DEFAULT 0,
  total_transactions integer NOT NULL DEFAULT 0,
  total_expenses numeric NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shifts_tenant_status_idx ON public.cashier_shifts (tenant_id, status);
CREATE INDEX IF NOT EXISTS shifts_cashier_idx ON public.cashier_shifts (cashier_id, opened_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_cashier
  ON public.cashier_shifts (cashier_id) WHERE status = 'open';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashier_shifts TO authenticated;
GRANT ALL ON public.cashier_shifts TO service_role;
ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant owner full shifts"
  ON public.cashier_shifts FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE TRIGGER trg_shifts_updated
  BEFORE UPDATE ON public.cashier_shifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Shift expenses
CREATE TABLE IF NOT EXISTS public.shift_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.cashier_shifts(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shift_expenses_shift_idx ON public.shift_expenses (shift_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_expenses TO authenticated;
GRANT ALL ON public.shift_expenses TO service_role;
ALTER TABLE public.shift_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant owner full shift_expenses"
  ON public.shift_expenses FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- Link transactions to cashier + shift
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cashier_id uuid REFERENCES public.cashiers(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS transactions_shift_idx ON public.transactions (shift_id);
CREATE INDEX IF NOT EXISTS transactions_cashier_idx ON public.transactions (cashier_id);
