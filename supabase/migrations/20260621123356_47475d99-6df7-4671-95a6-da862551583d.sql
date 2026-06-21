
-- Tabel satuan/kemasan per produk (pcs, slove, dus, dll)
CREATE TABLE public.product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  conversion integer NOT NULL DEFAULT 1, -- berapa unit dasar per 1 satuan ini
  sort_order integer NOT NULL DEFAULT 0,
  is_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_units_conversion_positive CHECK (conversion > 0),
  CONSTRAINT product_units_name_per_product UNIQUE (product_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_units TO authenticated;
GRANT ALL ON public.product_units TO service_role;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read product_units" ON public.product_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert product_units" ON public.product_units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update product_units" ON public.product_units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete product_units" ON public.product_units FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_product_units_updated_at BEFORE UPDATE ON public.product_units
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_product_units_product ON public.product_units(product_id);

-- Tabel tingkatan harga per satuan
CREATE TABLE public.product_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_unit_id uuid NOT NULL REFERENCES public.product_units(id) ON DELETE CASCADE,
  min_qty integer NOT NULL DEFAULT 1,
  price numeric NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_price_tiers_min_qty_positive CHECK (min_qty > 0),
  CONSTRAINT product_price_tiers_price_nonneg CHECK (price >= 0),
  CONSTRAINT product_price_tiers_unique_min UNIQUE (product_unit_id, min_qty)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_price_tiers TO authenticated;
GRANT ALL ON public.product_price_tiers TO service_role;
ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tiers" ON public.product_price_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert tiers" ON public.product_price_tiers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update tiers" ON public.product_price_tiers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete tiers" ON public.product_price_tiers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_product_price_tiers_updated_at BEFORE UPDATE ON public.product_price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_price_tiers_unit ON public.product_price_tiers(product_unit_id);

-- Tambah kolom satuan pada item transaksi (qty tetap dalam unit dasar untuk stok)
ALTER TABLE public.transaction_items
  ADD COLUMN unit_name text,
  ADD COLUMN unit_qty numeric,
  ADD COLUMN unit_conversion integer;
