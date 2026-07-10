CREATE OR REPLACE FUNCTION public.fefo_deduct_batches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  remaining integer;
  base_qty integer;
  b record;
  take integer;
  cost_sum numeric := 0;
  cost_qty integer := 0;
  fallback_cost numeric;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  base_qty := COALESCE(NEW.qty, 0) * COALESCE(NEW.unit_conversion, 1);
  IF base_qty <= 0 THEN
    RETURN NEW;
  END IF;
  remaining := base_qty;

  FOR b IN
    SELECT id, qty, unit_cost
    FROM public.product_batches
    WHERE product_id = NEW.product_id AND qty > 0
    ORDER BY expiry_date ASC NULLS LAST, created_at ASC
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(b.qty, remaining);
    IF b.unit_cost IS NOT NULL AND b.unit_cost > 0 THEN
      cost_sum := cost_sum + (b.unit_cost * take);
      cost_qty := cost_qty + take;
    END IF;
    IF take >= b.qty THEN
      DELETE FROM public.product_batches WHERE id = b.id;
    ELSE
      UPDATE public.product_batches SET qty = qty - take WHERE id = b.id;
    END IF;
    remaining := remaining - take;
  END LOOP;

  IF cost_qty > 0 THEN
    NEW.unit_cost := round((cost_sum / cost_qty)::numeric, 2);
  ELSIF NEW.unit_cost IS NULL OR NEW.unit_cost = 0 THEN
    SELECT cost_price INTO fallback_cost FROM public.products WHERE id = NEW.product_id;
    IF fallback_cost IS NOT NULL THEN
      NEW.unit_cost := fallback_cost;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;