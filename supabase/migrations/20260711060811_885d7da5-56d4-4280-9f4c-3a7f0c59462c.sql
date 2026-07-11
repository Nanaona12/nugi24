
-- 1) Per-product minimum stock
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock integer;

-- 2) Save PO receipt image
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS receipt_image_path text;

-- 3) Mark loss-cause resolved
CREATE TABLE IF NOT EXISTS public.resolved_loss_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_name text NOT NULL,
  note text,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resolved_loss_products TO authenticated;
GRANT ALL ON public.resolved_loss_products TO service_role;

ALTER TABLE public.resolved_loss_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read resolved loss"
  ON public.resolved_loss_products FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant insert resolved loss"
  ON public.resolved_loss_products FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant update resolved loss"
  ON public.resolved_loss_products FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant delete resolved loss"
  ON public.resolved_loss_products FOR DELETE
  TO authenticated
  USING (tenant_id = public.current_tenant_id());
