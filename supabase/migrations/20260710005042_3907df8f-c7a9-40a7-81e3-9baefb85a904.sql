CREATE TABLE public.cashier_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cashier_user_id uuid NOT NULL,
  customer_name text NOT NULL,
  note text,
  payload jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashier_holds TO authenticated;
GRANT ALL ON public.cashier_holds TO service_role;

ALTER TABLE public.cashier_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cashier can manage own holds"
ON public.cashier_holds
FOR ALL
TO authenticated
USING (tenant_id = public.current_tenant_id() AND cashier_user_id = auth.uid())
WITH CHECK (tenant_id = public.current_tenant_id() AND cashier_user_id = auth.uid());

CREATE INDEX cashier_holds_tenant_user_idx ON public.cashier_holds (tenant_id, cashier_user_id, saved_at DESC);

CREATE TRIGGER cashier_holds_set_updated_at
BEFORE UPDATE ON public.cashier_holds
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.cashier_holds;