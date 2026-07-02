ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS unit_name text,
  ADD COLUMN IF NOT EXISTS unit_conversion integer NOT NULL DEFAULT 1;