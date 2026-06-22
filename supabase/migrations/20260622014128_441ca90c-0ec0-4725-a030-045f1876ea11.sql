
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant can read own customers" ON public.customers
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "tenant can insert own customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant can update own customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant can delete own customers" ON public.customers
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE INDEX customers_tenant_id_idx ON public.customers(tenant_id);
CREATE INDEX customers_tenant_phone_idx ON public.customers(tenant_id, phone);

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
