CREATE TABLE public.admin_ai_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE, user_id uuid NOT NULL, messages jsonb NOT NULL DEFAULT '[]', blocked_status integer, blocked_message text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.admin_ai_conversations TO authenticated;
GRANT ALL ON public.admin_ai_conversations TO service_role;
ALTER TABLE public.admin_ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages AI conversation" ON public.admin_ai_conversations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.owner_user_id=auth.uid())) WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.owner_user_id=auth.uid()));
CREATE TABLE public.admin_ai_po_drafts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE, conversation_id uuid NOT NULL REFERENCES public.admin_ai_conversations(id) ON DELETE CASCADE, tool_call_id text NOT NULL, draft jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), po_id uuid REFERENCES public.purchase_orders(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(conversation_id,tool_call_id));
GRANT SELECT, INSERT, UPDATE ON public.admin_ai_po_drafts TO authenticated;
GRANT ALL ON public.admin_ai_po_drafts TO service_role;
ALTER TABLE public.admin_ai_po_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages AI PO drafts" ON public.admin_ai_po_drafts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.owner_user_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=tenant_id AND t.owner_user_id=auth.uid()));
CREATE INDEX admin_ai_po_drafts_tenant ON public.admin_ai_po_drafts(tenant_id,created_at);
CREATE FUNCTION public.admin_ai_touch_updated() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER admin_ai_conversations_updated BEFORE UPDATE ON public.admin_ai_conversations FOR EACH ROW EXECUTE FUNCTION public.admin_ai_touch_updated();
CREATE TRIGGER admin_ai_po_drafts_updated BEFORE UPDATE ON public.admin_ai_po_drafts FOR EACH ROW EXECUTE FUNCTION public.admin_ai_touch_updated();
CREATE FUNCTION public.approve_admin_ai_po(p_draft_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.admin_ai_po_drafts; v_po uuid; it jsonb; v_total numeric:=0; v_count integer:=0;
BEGIN
 SELECT * INTO d FROM public.admin_ai_po_drafts WHERE id=p_draft_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=d.tenant_id AND owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'Akses ditolak'; END IF;
 IF d.status='approved' THEN RETURN d.po_id; END IF;
 IF d.status<>'pending' THEN RAISE EXCEPTION 'Draf sudah ditolak'; END IF;
 IF COALESCE(trim(d.draft->>'supplier'),'')='' OR jsonb_array_length(d.draft->'items')=0 THEN RAISE EXCEPTION 'Supplier dan barang wajib diisi'; END IF;
 FOR it IN SELECT value FROM jsonb_array_elements(d.draft->'items') LOOP
  IF (it->>'qty')::numeric<=0 OR (it->>'unit_cost')::numeric<0 OR (it->>'unit_conversion')::integer<1 OR COALESCE(trim(it->>'product_name'),'')='' THEN RAISE EXCEPTION 'Barang tidak valid'; END IF;
  IF it->>'product_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=(it->>'product_id')::uuid AND tenant_id=d.tenant_id) THEN RAISE EXCEPTION 'Produk bukan milik toko'; END IF;
  v_total:=v_total+(it->>'qty')::numeric*(it->>'unit_cost')::numeric; v_count:=v_count+1;
 END LOOP;
 IF d.draft->>'payment_terms'='credit' AND COALESCE(d.draft->>'due_date','')='' THEN RAISE EXCEPTION 'Jatuh tempo wajib diisi untuk tempo'; END IF;
 INSERT INTO public.purchase_orders(tenant_id,user_id,supplier,status,notes,payment_terms,due_date,supplier_invoice_no,total,item_count) VALUES(d.tenant_id,auth.uid(),d.draft->>'supplier','draft',d.draft->>'notes',d.draft->>'payment_terms',NULLIF(d.draft->>'due_date','')::date,d.draft->>'invoice_no',v_total,v_count) RETURNING id INTO v_po;
 FOR it IN SELECT value FROM jsonb_array_elements(d.draft->'items') LOOP
  INSERT INTO public.purchase_order_items(tenant_id,po_id,product_id,product_code,product_name,qty,unit_cost,subtotal,unit_name,unit_conversion,sell_price,category) VALUES(d.tenant_id,v_po,NULLIF(it->>'product_id','')::uuid,COALESCE(it->>'product_code','-'),it->>'product_name',(it->>'qty')::numeric,(it->>'unit_cost')::numeric,(it->>'qty')::numeric*(it->>'unit_cost')::numeric,it->>'unit_name',(it->>'unit_conversion')::integer,NULLIF(it->>'sell_price','')::numeric,it->>'category');
 END LOOP;
 UPDATE public.admin_ai_po_drafts SET status='approved',po_id=v_po WHERE id=d.id;
 RETURN v_po;
END; $$;
REVOKE ALL ON FUNCTION public.approve_admin_ai_po(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_admin_ai_po(uuid) TO authenticated;