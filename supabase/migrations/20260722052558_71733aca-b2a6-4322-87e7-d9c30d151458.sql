
-- Stock movement log
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  old_stock integer NOT NULL DEFAULT 0,
  new_stock integer NOT NULL DEFAULT 0,
  delta integer NOT NULL DEFAULT 0,
  source text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created ON public.stock_movements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON public.stock_movements(product_id, created_at DESC);

GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Trigger function: log every stock change on products
CREATE OR REPLACE FUNCTION public.tg_log_product_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.stock,0) = COALESCE(NEW.stock,0) THEN
      RETURN NEW;
    END IF;
    BEGIN
      v_source := current_setting('app.stock_source', true);
    EXCEPTION WHEN OTHERS THEN
      v_source := NULL;
    END;
    INSERT INTO public.stock_movements (tenant_id, product_id, old_stock, new_stock, delta, source, changed_by)
    VALUES (NEW.tenant_id, NEW.id, COALESCE(OLD.stock,0), COALESCE(NEW.stock,0),
            COALESCE(NEW.stock,0) - COALESCE(OLD.stock,0), NULLIF(v_source,''), auth.uid());
  ELSIF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.stock,0) <> 0 THEN
      INSERT INTO public.stock_movements (tenant_id, product_id, old_stock, new_stock, delta, source, changed_by)
      VALUES (NEW.tenant_id, NEW.id, 0, COALESCE(NEW.stock,0), COALESCE(NEW.stock,0), 'initial', auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_product_stock_change ON public.products;
CREATE TRIGGER trg_log_product_stock_change
AFTER INSERT OR UPDATE OF stock ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_log_product_stock_change();
