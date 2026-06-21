
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD CONSTRAINT products_code_unique UNIQUE (code);

ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;

CREATE SEQUENCE IF NOT EXISTS public.product_code_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.product_code_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.next_product_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
  candidate text;
BEGIN
  LOOP
    n := nextval('public.product_code_seq');
    candidate := 'BRG' || lpad(n::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_product_code() TO authenticated;
