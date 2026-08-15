CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  account_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_backup_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  spreadsheet_id text,
  spreadsheet_url text,
  google_email text,
  connected_user_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  last_backup_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_backup_settings TO authenticated;
GRANT ALL ON public.tenant_backup_settings TO service_role;
ALTER TABLE public.tenant_backup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage backup settings"
  ON public.tenant_backup_settings FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE TRIGGER trg_tenant_backup_settings_updated
  BEFORE UPDATE ON public.tenant_backup_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tenant_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  detail jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_backup_runs_tenant ON public.tenant_backup_runs (tenant_id, created_at DESC);
GRANT SELECT ON public.tenant_backup_runs TO authenticated;
GRANT ALL ON public.tenant_backup_runs TO service_role;
ALTER TABLE public.tenant_backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read backup runs"
  ON public.tenant_backup_runs FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());