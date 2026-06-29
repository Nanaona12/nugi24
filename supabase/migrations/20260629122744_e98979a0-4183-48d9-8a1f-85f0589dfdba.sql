
CREATE TABLE public.bookkeeping_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_date timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('in','out')),
  description text NOT NULL,
  ref text,
  amount numeric NOT NULL CHECK (amount >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookkeeping_entries TO authenticated;
GRANT ALL ON public.bookkeeping_entries TO service_role;

ALTER TABLE public.bookkeeping_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant can view own bookkeeping"
ON public.bookkeeping_entries FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant can insert own bookkeeping"
ON public.bookkeeping_entries FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant can update own bookkeeping"
ON public.bookkeeping_entries FOR UPDATE TO authenticated
USING (tenant_id = public.current_tenant_id())
WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant can delete own bookkeeping"
ON public.bookkeeping_entries FOR DELETE TO authenticated
USING (tenant_id = public.current_tenant_id());

CREATE TRIGGER trg_bookkeeping_updated_at
BEFORE UPDATE ON public.bookkeeping_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_bookkeeping_tenant_date ON public.bookkeeping_entries(tenant_id, entry_date DESC);
