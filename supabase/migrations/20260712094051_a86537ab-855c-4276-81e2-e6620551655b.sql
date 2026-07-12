DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='products') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.products';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_units') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.product_units';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_price_tiers') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.product_price_tiers';
  END IF;
END $$;

ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.product_units REPLICA IDENTITY FULL;
ALTER TABLE public.product_price_tiers REPLICA IDENTITY FULL;