
-- Products table (shared across all authenticated users of the warung)
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(12,2),
  wholesale_min_qty INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update products" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete products" ON public.products FOR DELETE TO authenticated USING (true);

CREATE INDEX products_code_idx ON public.products (code);
CREATE INDEX products_name_idx ON public.products (name);

-- Transactions
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cashier_id UUID NOT NULL REFERENCES auth.users(id),
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert own transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = cashier_id);

-- Transaction items
CREATE TABLE public.transaction_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  is_wholesale BOOLEAN NOT NULL DEFAULT false,
  subtotal NUMERIC(14,2) NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_items TO authenticated;
GRANT ALL ON public.transaction_items TO service_role;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tx items" ON public.transaction_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tx items" ON public.transaction_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX tx_items_tx_idx ON public.transaction_items (transaction_id);

-- updated_at trigger for products
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
