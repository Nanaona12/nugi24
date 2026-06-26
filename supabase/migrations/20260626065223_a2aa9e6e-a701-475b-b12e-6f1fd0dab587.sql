
-- 1) Refund tables
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  cashier_id uuid NOT NULL,
  reason text,
  total numeric(14,2) NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_tenant_idx ON public.refunds(tenant_id, created_at DESC);
CREATE INDEX refunds_tx_idx ON public.refunds(transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read refunds" ON public.refunds FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() OR has_role(auth.uid(), 'super_admin'));
CREATE POLICY "tenant insert refunds" ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id() AND cashier_id = auth.uid());
CREATE POLICY "tenant update refunds" ON public.refunds FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant delete refunds" ON public.refunds FOR DELETE TO authenticated
  USING (tenant_id = current_tenant_id());

CREATE TABLE public.refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL DEFAULT current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  qty integer NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  unit_conversion integer NOT NULL DEFAULT 1,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refund_items_refund_idx ON public.refund_items(refund_id);
CREATE INDEX refund_items_tenant_idx ON public.refund_items(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_items TO authenticated;
GRANT ALL ON public.refund_items TO service_role;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read refund items" ON public.refund_items FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() OR has_role(auth.uid(), 'super_admin'));
CREATE POLICY "tenant insert refund items" ON public.refund_items FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant update refund items" ON public.refund_items FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant delete refund items" ON public.refund_items FOR DELETE TO authenticated
  USING (tenant_id = current_tenant_id());

-- Trigger: kembalikan stok produk saat refund_item dibuat
CREATE OR REPLACE FUNCTION public.refund_restore_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.qty > 0 THEN
    UPDATE public.products
      SET stock = COALESCE(stock,0) + (NEW.qty * COALESCE(NEW.unit_conversion,1))
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.refund_restore_stock() FROM anon, public;

CREATE TRIGGER trg_refund_restore_stock
  AFTER INSERT ON public.refund_items
  FOR EACH ROW EXECUTE FUNCTION public.refund_restore_stock();

-- 2) Receiving on Purchase Orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS qty_received integer NOT NULL DEFAULT 0;
