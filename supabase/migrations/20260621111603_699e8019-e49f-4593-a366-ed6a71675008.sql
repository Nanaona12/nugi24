
-- Allow delete on transactions & items
CREATE POLICY "Authenticated can delete transactions" ON public.transactions
  FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete tx items" ON public.transaction_items
  FOR DELETE TO authenticated USING (true);

-- Purchase Orders
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  supplier text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  total numeric NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read POs" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert own POs" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth update POs" ON public.purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete POs" ON public.purchase_orders FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid,
  product_code text NOT NULL,
  product_name text NOT NULL,
  qty integer NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read PO items" ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert PO items" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update PO items" ON public.purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete PO items" ON public.purchase_order_items FOR DELETE TO authenticated USING (true);
