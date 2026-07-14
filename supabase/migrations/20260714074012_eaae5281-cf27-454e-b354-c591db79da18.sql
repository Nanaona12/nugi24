
-- Bookkeeping "out" entry per refund
CREATE OR REPLACE FUNCTION public.tg_refund_bookkeeping()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.bookkeeping_entries (tenant_id, entry_date, kind, description, ref, amount)
  VALUES (NEW.tenant_id, NEW.created_at, 'out',
          'Refund transaksi #' || substr(NEW.transaction_id::text, 1, 8) ||
            COALESCE(' - ' || NEW.reason, ''),
          NEW.id::text, COALESCE(NEW.total, 0));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refund_bookkeeping ON public.refunds;
CREATE TRIGGER trg_refund_bookkeeping
AFTER INSERT ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_refund_bookkeeping();

-- Reduce original transaction_items & recompute transaction totals on each refund item
CREATE OR REPLACE FUNCTION public.tg_refund_item_adjust_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx_id uuid;
  v_new_total numeric;
  v_new_count integer;
BEGIN
  SELECT transaction_id INTO v_tx_id FROM public.refunds WHERE id = NEW.refund_id;
  IF v_tx_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.transaction_items
    SET qty = GREATEST(0, qty - COALESCE(NEW.qty, 0)),
        subtotal = GREATEST(0, subtotal - COALESCE(NEW.subtotal, 0))
    WHERE transaction_id = v_tx_id
      AND product_code = NEW.product_code;

  SELECT COALESCE(SUM(subtotal), 0), COALESCE(SUM(qty), 0)
    INTO v_new_total, v_new_count
    FROM public.transaction_items
    WHERE transaction_id = v_tx_id;

  UPDATE public.transactions
    SET total = v_new_total,
        item_count = v_new_count
    WHERE id = v_tx_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refund_item_adjust_tx ON public.refund_items;
CREATE TRIGGER trg_refund_item_adjust_tx
AFTER INSERT ON public.refund_items
FOR EACH ROW EXECUTE FUNCTION public.tg_refund_item_adjust_tx();
