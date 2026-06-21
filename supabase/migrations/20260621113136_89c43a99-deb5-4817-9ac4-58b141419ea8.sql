
-- Tighten RLS to enforce ownership and lock down SECURITY DEFINER function

-- ============ Transactions: owner-only ============
DROP POLICY IF EXISTS "Authenticated can read transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated can delete transactions" ON public.transactions;

CREATE POLICY "Owners can read own transactions" ON public.transactions
  FOR SELECT TO authenticated USING (auth.uid() = cashier_id);

CREATE POLICY "Owners can delete own transactions" ON public.transactions
  FOR DELETE TO authenticated USING (auth.uid() = cashier_id);

-- ============ Transaction items: scoped via parent ============
DROP POLICY IF EXISTS "Authenticated can read tx items" ON public.transaction_items;
DROP POLICY IF EXISTS "Authenticated can insert tx items" ON public.transaction_items;
DROP POLICY IF EXISTS "Authenticated can delete tx items" ON public.transaction_items;

CREATE POLICY "Owners can read own tx items" ON public.transaction_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.cashier_id = auth.uid())
  );

CREATE POLICY "Owners can insert own tx items" ON public.transaction_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.cashier_id = auth.uid())
  );

CREATE POLICY "Owners can delete own tx items" ON public.transaction_items
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.cashier_id = auth.uid())
  );

-- ============ Purchase orders: owner-only ============
DROP POLICY IF EXISTS "Auth read POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "Auth update POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "Auth delete POs" ON public.purchase_orders;

CREATE POLICY "Owners can read own POs" ON public.purchase_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Owners can update own POs" ON public.purchase_orders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete own POs" ON public.purchase_orders
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ PO items: scoped via parent ============
DROP POLICY IF EXISTS "Auth read PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Auth insert PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Auth update PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Auth delete PO items" ON public.purchase_order_items;

CREATE POLICY "Owners can read own PO items" ON public.purchase_order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Owners can insert own PO items" ON public.purchase_order_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Owners can update own PO items" ON public.purchase_order_items
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Owners can delete own PO items" ON public.purchase_order_items
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND p.user_id = auth.uid())
  );

-- ============ Lock down SECURITY DEFINER function: authenticated only ============
REVOKE EXECUTE ON FUNCTION public.next_product_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_product_code() TO authenticated;
