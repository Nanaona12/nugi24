
-- 1. Products: image_url
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Tenants: slug + showcase toggle
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS showcase_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS showcase_description text;

-- Slug helper: lowercase, alnum + dashes
CREATE OR REPLACE FUNCTION public.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(input,'')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Backfill slugs
UPDATE public.tenants t
SET slug = base.slug
FROM (
  SELECT id, 
    CASE 
      WHEN public.slugify(name) = '' THEN 'toko-' || substr(id::text,1,8)
      ELSE public.slugify(name) || '-' || substr(id::text,1,4)
    END AS slug
  FROM public.tenants
) base
WHERE t.id = base.id AND t.slug IS NULL;

-- Unique index
CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON public.tenants(slug) WHERE slug IS NOT NULL;

-- 3. Public read policies for anon
-- Tenants: expose only showcase-enabled rows, limited columns
DROP POLICY IF EXISTS "public showcase tenants" ON public.tenants;
CREATE POLICY "public showcase tenants"
  ON public.tenants FOR SELECT
  TO anon, authenticated
  USING (showcase_enabled = true AND slug IS NOT NULL);

-- Products: rows for showcase-enabled tenants
DROP POLICY IF EXISTS "public showcase products" ON public.products;
CREATE POLICY "public showcase products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = products.tenant_id AND t.showcase_enabled = true));

-- Product units
DROP POLICY IF EXISTS "public showcase product_units" ON public.product_units;
CREATE POLICY "public showcase product_units"
  ON public.product_units FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = product_units.tenant_id AND t.showcase_enabled = true));

-- Product price tiers
DROP POLICY IF EXISTS "public showcase product_price_tiers" ON public.product_price_tiers;
CREATE POLICY "public showcase product_price_tiers"
  ON public.product_price_tiers FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = product_price_tiers.tenant_id AND t.showcase_enabled = true));

-- Grant column-level SELECT to anon (exclude cost_price, wholesale_*)
GRANT SELECT (id, name, phone, address, slug, showcase_enabled, showcase_description) ON public.tenants TO anon;
GRANT SELECT (id, tenant_id, code, name, category, price, stock, image_url, barcode) ON public.products TO anon;
GRANT SELECT ON public.product_units TO anon;
GRANT SELECT ON public.product_price_tiers TO anon;

-- 4. Storage policies for product-photos bucket
-- Public read
DROP POLICY IF EXISTS "public read product-photos" ON storage.objects;
CREATE POLICY "public read product-photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-photos');

-- Authenticated users can upload to their tenant folder (folder = tenant_id::text)
DROP POLICY IF EXISTS "tenant upload product-photos" ON storage.objects;
CREATE POLICY "tenant upload product-photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

DROP POLICY IF EXISTS "tenant update product-photos" ON storage.objects;
CREATE POLICY "tenant update product-photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

DROP POLICY IF EXISTS "tenant delete product-photos" ON storage.objects;
CREATE POLICY "tenant delete product-photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
