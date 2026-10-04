CREATE OR REPLACE FUNCTION public.tg_supplier_debt_payment_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier text;
  v_invoice text;
BEGIN
  -- Cash paid from a cashier shift is already included in that shift's cash settlement.
  IF NEW.note LIKE 'Dari pengeluaran shift:%' AND EXISTS (
    SELECT 1 FROM public.shift_expenses e
    JOIN public.supplier_debts d ON d.po_id = e.po_id AND d.id = NEW.debt_id
    WHERE e.id::text = split_part(NEW.note, ':', 2)
      AND e.tenant_id = NEW.tenant_id
      AND e.amount = NEW.amount
      AND e.category = 'supplier'
  ) THEN
    RETURN NEW;
  END IF;
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
$function$;