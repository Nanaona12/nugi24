
CREATE TABLE public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty >= 0),
  expiry_date date NOT NULL,
  note text,
  source text NOT NULL DEFAULT 'manual',
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select batches" ON public.product_batches
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant insert batches" ON public.product_batches
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update batches" ON public.product_batches
  FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete batches" ON public.product_batches
  FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE INDEX idx_product_batches_tenant_expiry ON public.product_batches(tenant_id, expiry_date);
CREATE INDEX idx_product_batches_product ON public.product_batches(product_id, expiry_date);

CREATE TRIGGER trg_product_batches_updated_at
  BEFORE UPDATE ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- FEFO deduction trigger on transaction_items
CREATE OR REPLACE FUNCTION public.fefo_deduct_batches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
  base_qty integer;
  b RECORD;
  take integer;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  -- convert to base units
  base_qty := COALESCE(NEW.qty, 0) * COALESCE(NEW.unit_conversion, 1);
  IF base_qty <= 0 THEN RETURN NEW; END IF;
  remaining := base_qty;

  FOR b IN
    SELECT id, qty FROM public.product_batches
    WHERE product_id = NEW.product_id AND qty > 0
    ORDER BY expiry_date ASC, created_at ASC
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(b.qty, remaining);
    IF take >= b.qty THEN
      DELETE FROM public.product_batches WHERE id = b.id;
    ELSE
      UPDATE public.product_batches SET qty = qty - take WHERE id = b.id;
    END IF;
    remaining := remaining - take;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fefo_deduct
  AFTER INSERT ON public.transaction_items
  FOR EACH ROW EXECUTE FUNCTION public.fefo_deduct_batches();
