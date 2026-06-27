
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS static_qris_payload text;

DROP FUNCTION IF EXISTS public.current_tenant_info();

CREATE OR REPLACE FUNCTION public.current_tenant_info()
RETURNS TABLE(id uuid, name text, phone text, address text, static_qris_payload text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.phone, t.address, t.static_qris_payload
  FROM public.tenants t
  WHERE t.id = public.current_tenant_id()
$$;
REVOKE ALL ON FUNCTION public.current_tenant_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_info() TO authenticated;
