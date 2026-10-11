CREATE OR REPLACE FUNCTION public.mysql_backup_read_page(p_tenant uuid,p_after text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(e) || jsonb_build_object('seq',e.seq::text) ORDER BY e.seq),'[]'::jsonb)
 FROM (SELECT tenant_id,seq,table_name,record_id,operation,payload,previous_payload,recorded_at FROM public.mysql_backup_events WHERE tenant_id=p_tenant AND seq>p_after::bigint ORDER BY seq LIMIT 101) e;
$$;
REVOKE ALL ON FUNCTION public.mysql_backup_read_page(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mysql_backup_read_page(uuid,text) TO service_role;