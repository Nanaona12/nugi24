ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_code_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_code_unique;
ALTER TABLE public.products ADD CONSTRAINT products_tenant_code_unique UNIQUE (tenant_id, code);

CREATE OR REPLACE FUNCTION public.next_product_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
  candidate text;
  tenant uuid := public.current_tenant_id();
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'Toko aktif tidak ditemukan';
  END IF;
  LOOP
    n := nextval('public.product_code_seq');
    candidate := 'BRG' || lpad(n::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE tenant_id = tenant AND code = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_product_code() TO authenticated;