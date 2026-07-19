
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS profit_reset_at timestamptz;

CREATE TABLE IF NOT EXISTS public.profit_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  actor_name text,
  action text NOT NULL,
  amount numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profit_activity_log TO authenticated;
GRANT ALL ON public.profit_activity_log TO service_role;

ALTER TABLE public.profit_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can view profit log"
  ON public.profit_activity_log FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant members can insert profit log"
  ON public.profit_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE INDEX IF NOT EXISTS profit_activity_log_tenant_created_idx
  ON public.profit_activity_log (tenant_id, created_at DESC);
