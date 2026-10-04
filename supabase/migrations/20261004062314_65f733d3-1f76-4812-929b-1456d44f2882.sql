CREATE OR REPLACE FUNCTION public.tg_debt_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only the owner's resolution of a closed cashier shortage skips a second cash-out.
  IF NEW.shift_id IS NOT NULL
     AND NEW.debtor_type = 'employee'
     AND NEW.note LIKE 'Selisih kurang closing shift %'
     AND EXISTS (
       SELECT 1 FROM public.cashier_shifts s
       JOIN public.tenants t ON t.id = s.tenant_id
       JOIN public.bookkeeping_entries b ON b.tenant_id = s.tenant_id
         AND b.ref = 'cashier-shortage:' || s.id::text AND b.kind = 'out'
       WHERE s.id = NEW.shift_id
         AND s.tenant_id = NEW.tenant_id
         AND s.status = 'closed'
         AND s.shortage_resolution = 'pending'
         AND s.cashier_id = NEW.cashier_id
         AND b.amount = NEW.original_amount
         AND t.owner_user_id = auth.uid()
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