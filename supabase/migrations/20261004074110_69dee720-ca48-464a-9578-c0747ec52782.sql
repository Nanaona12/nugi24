DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE shift_id = 'b0e6eda9-1103-478d-86f1-c412e6b42de8'::uuid
       OR cashier_id = '96a81af2-70c8-4d79-a761-89c404c232b5'::uuid
  ) THEN
    RAISE EXCEPTION 'Data uji memiliki transaksi; pembersihan dibatalkan';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shift_expenses
    WHERE shift_id = 'b0e6eda9-1103-478d-86f1-c412e6b42de8'::uuid
  ) THEN
    RAISE EXCEPTION 'Data uji memiliki pengeluaran; pembersihan dibatalkan';
  END IF;

  DELETE FROM public.bookkeeping_entries
  WHERE id = '71d6488f-03f0-4811-8dc9-631d99c8e76b'::uuid
    AND tenant_id = '01ca8b0d-7b8d-4ba5-b2c1-67e4f313683e'::uuid
    AND ref = 'cashier-shortage:b0e6eda9-1103-478d-86f1-c412e6b42de8';

  DELETE FROM public.cashier_shifts
  WHERE id = 'b0e6eda9-1103-478d-86f1-c412e6b42de8'::uuid
    AND tenant_id = '01ca8b0d-7b8d-4ba5-b2c1-67e4f313683e'::uuid
    AND cashier_id = '96a81af2-70c8-4d79-a761-89c404c232b5'::uuid
    AND total_transactions = 0;

  DELETE FROM public.cashiers
  WHERE id = '96a81af2-70c8-4d79-a761-89c404c232b5'::uuid
    AND tenant_id = '01ca8b0d-7b8d-4ba5-b2c1-67e4f313683e'::uuid
    AND name = 'UJI CLOSING 04 OKT';
END $$;