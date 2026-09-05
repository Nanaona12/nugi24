ALTER TABLE public.supplier_debts ADD COLUMN IF NOT EXISTS saved_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE public.supplier_debt_savings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES public.supplier_debts(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_debt_savings TO authenticated;
GRANT ALL ON public.supplier_debt_savings TO service_role;

ALTER TABLE public.supplier_debt_savings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant manage supplier debt savings"
ON public.supplier_debt_savings
FOR ALL
TO authenticated
USING (tenant_id = public.current_tenant_id())
WITH CHECK (tenant_id = public.current_tenant_id());

CREATE INDEX idx_supplier_debt_savings_debt ON public.supplier_debt_savings (debt_id);

CREATE OR REPLACE FUNCTION public.tg_supplier_debt_savings_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _debt uuid := COALESCE(NEW.debt_id, OLD.debt_id);
  _saved numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO _saved
  FROM public.supplier_debt_savings WHERE debt_id = _debt;
  UPDATE public.supplier_debts
     SET saved_amount = GREATEST(_saved, 0), updated_at = now()
   WHERE id = _debt;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_supplier_debt_savings_recalc() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_supplier_debt_savings_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_debt_savings
FOR EACH ROW EXECUTE FUNCTION public.tg_supplier_debt_savings_recalc();

CREATE OR REPLACE FUNCTION public.tg_supplier_debt_payment_consume_savings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _saved numeric;
  _use numeric;
BEGIN
  SELECT COALESCE(saved_amount, 0) INTO _saved FROM public.supplier_debts WHERE id = NEW.debt_id;
  IF _saved IS NULL OR _saved <= 0 THEN RETURN NULL; END IF;
  _use := LEAST(_saved, NEW.amount);
  INSERT INTO public.supplier_debt_savings (tenant_id, debt_id, amount, note, created_by)
  VALUES (NEW.tenant_id, NEW.debt_id, -_use, 'Dipakai untuk pembayaran', NEW.created_by);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_supplier_debt_payment_consume_savings() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_supplier_debt_payment_consume_savings
AFTER INSERT ON public.supplier_debt_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_supplier_debt_payment_consume_savings();