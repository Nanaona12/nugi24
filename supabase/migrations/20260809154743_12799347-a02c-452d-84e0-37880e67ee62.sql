-- 1) Batch insert menambah stok produk (sumber kebenaran penambahan stok)
CREATE OR REPLACE FUNCTION public.tg_batch_add_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Jangan tambah stok bila batch dibuat oleh trigger lain (auto-batch dari perubahan stok)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.qty, 0) > 0 THEN
    UPDATE public.products
      SET stock = COALESCE(stock, 0) + NEW.qty
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_add_stock ON public.product_batches;
CREATE TRIGGER trg_batch_add_stock
AFTER INSERT ON public.product_batches
FOR EACH ROW EXECUTE FUNCTION public.tg_batch_add_stock();

-- 2) Kenaikan stok manual otomatis membuat batch dengan modal saat ini
CREATE OR REPLACE FUNCTION public.tg_products_autobatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  delta integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.stock, 0);
  ELSE
    delta := COALESCE(NEW.stock, 0) - COALESCE(OLD.stock, 0);
  END IF;

  IF delta <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.product_batches (tenant_id, product_id, qty, unit_cost, source, note)
  VALUES (NEW.tenant_id, NEW.id, delta,
          NULLIF(COALESCE(NEW.cost_price, 0), 0),
          'manual', 'Penambahan stok manual');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_autobatch ON public.products;
CREATE TRIGGER trg_products_autobatch
AFTER INSERT OR UPDATE OF stock ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_products_autobatch();

-- 3) FEFO/FIFO: batch terdekat kedaluwarsa dulu, lalu yang paling lama dibeli
CREATE OR REPLACE FUNCTION public.fefo_deduct_batches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  remaining integer;
  base_qty integer;
  b record;
  take integer;
  cost_sum numeric := 0;
  cost_qty integer := 0;
  fallback_cost numeric;
  derived_cost numeric;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  base_qty := COALESCE(NEW.qty, 0) * COALESCE(NEW.unit_conversion, 1);
  IF base_qty <= 0 THEN
    RETURN NEW;
  END IF;
  remaining := base_qty;

  SELECT cost_price INTO fallback_cost FROM public.products WHERE id = NEW.product_id;

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
    derived_cost := round((cost_sum / cost_qty)::numeric, 2);
    -- Pengaman salah input: modal per kemasan tercatat sebagai modal per unit dasar
    IF fallback_cost IS NOT NULL AND fallback_cost > 0 AND derived_cost > fallback_cost * 3 THEN
      NEW.unit_cost := fallback_cost;
    ELSE
      NEW.unit_cost := derived_cost;
    END IF;
  ELSIF (NEW.unit_cost IS NULL OR NEW.unit_cost = 0) AND fallback_cost IS NOT NULL THEN
    NEW.unit_cost := fallback_cost;
  ELSIF fallback_cost IS NOT NULL AND fallback_cost > 0 AND NEW.unit_cost > fallback_cost * 3 THEN
    NEW.unit_cost := fallback_cost;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) Batch awal untuk stok yang belum punya catatan batch
DO $seed$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id, p.tenant_id, p.cost_price, p.stock - COALESCE(b.bq, 0) AS diff
    FROM public.products p
    LEFT JOIN (SELECT product_id, SUM(qty) bq FROM public.product_batches GROUP BY 1) b
      ON b.product_id = p.id
    WHERE COALESCE(p.stock, 0) - COALESCE(b.bq, 0) > 0
  LOOP
    INSERT INTO public.product_batches (tenant_id, product_id, qty, unit_cost, source, note, created_at)
    VALUES (r.tenant_id, r.id, r.diff, NULLIF(COALESCE(r.cost_price, 0), 0), 'opening', 'Saldo awal stok', now() - interval '10 years');
    -- kembalikan stok karena trigger penambah stok ikut berjalan
    UPDATE public.products SET stock = stock - r.diff WHERE id = r.id;
  END LOOP;
END
$seed$;