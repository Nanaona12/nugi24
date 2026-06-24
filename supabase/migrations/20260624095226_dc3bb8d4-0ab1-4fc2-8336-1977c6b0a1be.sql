
-- Add barcode column to products and snapshot in PO items + transaction items
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_unique
  ON public.products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products (barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS product_barcode text;
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS product_barcode text;
