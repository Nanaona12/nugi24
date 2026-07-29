REVOKE ALL ON FUNCTION public.tg_debt_bookkeeping() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_debt_payment_bookkeeping() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_debt_recalc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_log_product_stock_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_refund_bookkeeping() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_refund_item_adjust_tx() FROM PUBLIC, anon, authenticated;