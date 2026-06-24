CREATE TABLE public.household_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty > 0),
  unit_conversion integer NOT NULL DEFAULT 1,
  taken_by text,
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','unpaid','partial')),
  note text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_withdrawals TO authenticated;
GRANT ALL ON public.household_withdrawals TO service_role;

ALTER TABLE public.household_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select hw" ON public.household_withdrawals FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "tenant insert hw" ON public.household_withdrawals FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant update hw" ON public.household_withdrawals FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant delete hw" ON public.household_withdrawals FOR DELETE TO authenticated
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_hw_updated_at BEFORE UPDATE ON public.household_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Reuse FEFO batch deducer (it reads NEW.product_id, NEW.qty, NEW.unit_conversion)
CREATE TRIGGER trg_hw_fefo AFTER INSERT ON public.household_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.fefo_deduct_batches();

-- Also reduce products.stock on insert
CREATE OR REPLACE FUNCTION public.hw_reduce_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products
    SET stock = GREATEST(0, stock - (COALESCE(NEW.qty,0) * COALESCE(NEW.unit_conversion,1)))
    WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hw_reduce_stock AFTER INSERT ON public.household_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.hw_reduce_stock();