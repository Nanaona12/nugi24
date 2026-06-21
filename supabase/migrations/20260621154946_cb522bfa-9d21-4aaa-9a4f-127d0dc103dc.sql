
-- Super admin management policies (no INSERT on products/transactions for them)
CREATE POLICY "super admin manage tenants update" ON public.tenants
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super admin manage tenants delete" ON public.tenants
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super admin manage subscriptions update" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super admin manage subscriptions insert" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super admin manage subscriptions delete" ON public.subscriptions
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super admin manage payments update" ON public.payments
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super admin manage payments delete" ON public.payments
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));

-- Update handle_new_user: skip auto tenant for super admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $$
DECLARE
  v_tenant_id uuid;
  v_name text;
  v_is_super boolean := lower(NEW.email) = 'sugarpies1211@gmail.com';
BEGIN
  IF v_is_super THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  v_name := COALESCE(NEW.raw_user_meta_data->>'shop_name',
                     NEW.raw_user_meta_data->>'name',
                     split_part(NEW.email,'@',1));

  INSERT INTO public.tenants (owner_user_id, name)
  VALUES (NEW.id, v_name)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.subscriptions (tenant_id) VALUES (v_tenant_id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Clean up any auto-created tenant for the super admin
DELETE FROM public.tenants
WHERE owner_user_id IN (
  SELECT id FROM auth.users WHERE lower(email) = 'sugarpies1211@gmail.com'
);
