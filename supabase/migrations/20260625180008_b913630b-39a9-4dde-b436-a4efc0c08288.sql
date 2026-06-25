
CREATE TABLE public.plan_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_email text,
  source text NOT NULL DEFAULT 'admin',
  old_plan text,
  new_plan text NOT NULL,
  old_period text,
  new_period text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plan_change_audit TO authenticated;
GRANT ALL ON public.plan_change_audit TO service_role;

ALTER TABLE public.plan_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can read all plan audits"
  ON public.plan_change_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owner can read own tenant plan audits"
  ON public.plan_change_audit FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()));

CREATE INDEX idx_plan_change_audit_tenant ON public.plan_change_audit(tenant_id, created_at DESC);

-- Enable realtime for subscriptions so the client can auto-sync plan/status updates.
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'subscriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions';
  END IF;
END$$;
