-- Remove broad table-level SELECT for anon; grant only safe showcase columns
REVOKE SELECT ON public.tenants FROM anon;

GRANT SELECT (
  id,
  name,
  slug,
  phone,
  address,
  showcase_description,
  showcase_enabled,
  latitude,
  longitude
) ON public.tenants TO anon;