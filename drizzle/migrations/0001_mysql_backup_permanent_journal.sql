CREATE TABLE public.mysql_backup_counters (tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id), last_seq bigint NOT NULL DEFAULT 0);
GRANT ALL ON public.mysql_backup_counters TO service_role;
ALTER TABLE public.mysql_backup_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mysql_backup_events (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 seq bigint NOT NULL,
 table_name text NOT NULL,
 record_id text NOT NULL,
 operation text NOT NULL,
 payload jsonb NOT NULL,
 previous_payload jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,seq)
);
GRANT SELECT ON public.mysql_backup_events TO authenticated;
GRANT ALL ON public.mysql_backup_events TO service_role;
ALTER TABLE public.mysql_backup_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads permanent backup events" ON public.mysql_backup_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.owner_user_id=auth.uid()));

CREATE TABLE public.mysql_backup_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 label text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 public_key jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 last_seen_at timestamptz,
 last_ack bigint NOT NULL DEFAULT 0
);
GRANT SELECT (id,tenant_id,label,created_at,revoked_at,last_seen_at,last_ack) ON public.mysql_backup_devices TO authenticated;
GRANT ALL ON public.mysql_backup_devices TO service_role;
ALTER TABLE public.mysql_backup_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own backup devices" ON public.mysql_backup_devices FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.owner_user_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.mysql_backup_safe_payload(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT p - ARRAY['pin_hash','pin_salt','cashier_code','cashier_auth_password','cashier_auth_user_id','static_qris_payload','token','access_token','refresh_token','password'];
$$;
REVOKE ALL ON FUNCTION public.mysql_backup_safe_payload(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mysql_backup_safe_payload(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mysql_backup_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb; old_p jsonb; tid uuid; n bigint;
BEGIN
 p:=public.mysql_backup_safe_payload(CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
 IF TG_OP='UPDATE' THEN old_p:=public.mysql_backup_safe_payload(to_jsonb(OLD)); END IF;
 tid:=(p->>'tenant_id')::uuid;
 IF tid IS NULL THEN RAISE EXCEPTION 'Backup requires tenant'; END IF;
 INSERT INTO public.mysql_backup_counters(tenant_id,last_seq) VALUES(tid,1)
 ON CONFLICT(tenant_id) DO UPDATE SET last_seq=mysql_backup_counters.last_seq+1 RETURNING last_seq INTO n;
 INSERT INTO public.mysql_backup_events(tenant_id,seq,table_name,record_id,operation,payload,previous_payload)
 VALUES(tid,n,TG_TABLE_NAME,p->>'id',lower(TG_OP),p,old_p);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.mysql_backup_capture() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mysql_backup_capture() TO service_role;

DO $$
DECLARE tbl text; row_data record; tid uuid; n bigint;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['products','product_units','product_price_tiers','product_batches','transactions','transaction_items','refunds','refund_items','customers','debts','debt_payments','bookkeeping_entries','cashiers','cashier_shifts','shift_expenses','stock_movements','purchase_orders','purchase_order_items','promos','household_withdrawals','profit_activity_log','suppliers','supplier_debts','supplier_debt_payments','supplier_debt_savings'] LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',tbl);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['products','product_units','product_price_tiers','product_batches','transactions','transaction_items','refunds','refund_items','customers','debts','debt_payments','bookkeeping_entries','cashiers','cashier_shifts','shift_expenses','stock_movements','purchase_orders','purchase_order_items','promos','household_withdrawals','profit_activity_log','suppliers','supplier_debts','supplier_debt_payments','supplier_debt_savings'] LOOP
  EXECUTE format('CREATE TRIGGER mysql_backup_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mysql_backup_capture()',tbl);
  FOR row_data IN EXECUTE format('SELECT public.mysql_backup_safe_payload(to_jsonb(r)) AS p FROM public.%I r ORDER BY tenant_id,id',tbl) LOOP
   tid:=(row_data.p->>'tenant_id')::uuid;
   INSERT INTO public.mysql_backup_counters(tenant_id,last_seq) VALUES(tid,1)
    ON CONFLICT(tenant_id) DO UPDATE SET last_seq=mysql_backup_counters.last_seq+1 RETURNING last_seq INTO n;
   INSERT INTO public.mysql_backup_events(tenant_id,seq,table_name,record_id,operation,payload)
    VALUES(tid,n,tbl,row_data.p->>'id','snapshot',row_data.p);
  END LOOP;
 END LOOP;
END; $$;
COMMENT ON TABLE public.mysql_backup_events IS 'Permanent business-only journal for append-only local MySQL backup. Includes initial additive backfill and sanitized old/new versions; no authenticated UPDATE or DELETE.';