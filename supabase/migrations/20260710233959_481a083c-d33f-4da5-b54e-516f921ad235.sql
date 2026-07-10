
-- 1) Public showcase view for tenants — exposes ONLY safe columns
CREATE OR REPLACE VIEW public.tenants_showcase
WITH (security_invoker = off) AS
SELECT
  id,
  name,
  slug,
  phone,
  address,
  showcase_description,
  showcase_enabled,
  latitude,
  longitude
FROM public.tenants
WHERE showcase_enabled = true AND slug IS NOT NULL;

GRANT SELECT ON public.tenants_showcase TO anon, authenticated;

-- 2) Remove the overly-broad tenants SELECT policy that exposed all columns
DROP POLICY IF EXISTS "public showcase tenants" ON public.tenants;

-- 3) Restrict product-photos storage read to tenants that opted into showcase
DROP POLICY IF EXISTS "public read product-photos" ON storage.objects;

CREATE POLICY "public read product-photos (showcase only)"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'product-photos'
  AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.showcase_enabled = true
      AND t.slug IS NOT NULL
  )
);
