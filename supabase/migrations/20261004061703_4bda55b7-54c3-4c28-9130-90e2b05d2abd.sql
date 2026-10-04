CREATE OR REPLACE FUNCTION public.tg_debt_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A cashier shortage is already booked as cash out at shift close.
  -- The employee receivable records who owes it; it is not another cash movement.
  IF NEW.shift_id IS NOT NULL
     AND NEW.debtor_type = 'employee'
     AND NEW.note LIKE 'Selisih kurang closing shift %'
     AND EXISTS (
       SELECT 1 FROM public.bookkeeping_entries b
       WHERE b.tenant_id = NEW.tenant_id
         AND b.ref = 'cashier-shortage:' || NEW.shift_id::text
         AND b.kind = 'out'
     ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.bookkeeping_entries (tenant_id, entry_date, kind, description, ref, amount)
  VALUES (NEW.tenant_id, NEW.created_at, 'out',
          'Kasbon: ' || NEW.debtor_name || COALESCE(' (' || NEW.note || ')',''),
          NEW.id::text, NEW.original_amount);
  RETURN NEW;
END;
$function$;