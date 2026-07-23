
-- Promo types
DO $$ BEGIN
  CREATE TYPE public.promo_type AS ENUM ('bxgy','clearance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.promos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.promo_type NOT NULL,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  -- BXGY
  buy_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  buy_qty integer,
  free_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  free_qty integer,
  -- Clearance
  clearance_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  clearance_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promos_tenant_idx ON public.promos(tenant_id);
CREATE INDEX IF NOT EXISTS promos_clearance_product_idx ON public.promos(clearance_product_id) WHERE type = 'clearance';
CREATE INDEX IF NOT EXISTS promos_buy_product_idx ON public.promos(buy_product_id) WHERE type = 'bxgy';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promos TO authenticated;
GRANT ALL ON public.promos TO service_role;

ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages promos" ON public.promos
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "Super admin views all promos" ON public.promos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER tg_promos_updated_at
  BEFORE UPDATE ON public.promos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- transaction_items additions
ALTER TABLE public.transaction_items
  ADD COLUMN IF NOT EXISTS promo_id uuid REFERENCES public.promos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
