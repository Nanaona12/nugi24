REVOKE ALL ON public.mysql_backup_events FROM anon,authenticated;
GRANT SELECT ON public.mysql_backup_events TO authenticated;
REVOKE ALL ON public.mysql_backup_counters FROM anon,authenticated;
REVOKE ALL ON public.mysql_backup_devices FROM anon,authenticated;
GRANT SELECT (id,tenant_id,label,created_at,revoked_at,last_seen_at,last_ack) ON public.mysql_backup_devices TO authenticated;
GRANT ALL ON public.mysql_backup_events,public.mysql_backup_counters,public.mysql_backup_devices TO service_role;
REVOKE ALL ON FUNCTION public.mysql_backup_read_page(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mysql_backup_read_page(uuid,text) TO service_role;