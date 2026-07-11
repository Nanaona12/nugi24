-- Recreate tenants_showcase as SECURITY INVOKER view with column-level grants + narrow RLS policy
DROP VIEW IF EXISTS public.tenants_showcase;

CREATE VIEW public.tenants_showcase
WITH (security_invoker = on, security_barrier = on) AS
SELECT
  id, name, slug, phone, address,
  showcase_description, showcase_enabled,
  latitude, longitude
FROM public.tenants
WHERE showcase_enabled = true AND slug IS NOT NULL;

GRANT SELECT ON public.tenants_showcase TO anon, authenticated;

-- Ensure anon can only SELECT safe columns on tenants (column-level grants)
REVOKE SELECT ON public.tenants FROM anon;
GRANT SELECT (id, name, slug, phone, address, showcase_description, showcase_enabled, latitude, longitude)
  ON public.tenants TO anon;

-- Narrow RLS policy for anon to read showcase-enabled tenant rows only
DROP POLICY IF EXISTS "public showcase tenants safe" ON public.tenants;
CREATE POLICY "public showcase tenants safe"
ON public.tenants
FOR SELECT
TO anon
USING (showcase_enabled = true AND slug IS NOT NULL);
