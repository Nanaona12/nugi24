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
          WHEN status = 'cancelled' THEN 'cancelled'
          WHEN v_original > 0 AND v_original - v_total < 1 THEN 'paid'
          WHEN v_total > 0 THEN 'partial'
          ELSE 'open' END,
        updated_at = now()
    WHERE id = v_debt;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.tg_supplier_debt_recalc() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.supplier_debts ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.supplier_debts ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.supplier_debts SET status = 'paid', updated_at = now()
  WHERE status IN ('open','partial') AND total > 0 AND total - paid_amount < 1;