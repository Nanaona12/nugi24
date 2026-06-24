
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_tenant_id uuid;
  v_name text;
  v_is_super boolean := lower(NEW.email) = 'sugarpies1211@gmail.com';
  v_kind text := NEW.raw_user_meta_data->>'kind';
BEGIN
  IF v_is_super THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Shared cashier session user: don't create a tenant
  IF v_kind = 'cashier_session' THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(NEW.raw_user_meta_data->>'shop_name',
                     NEW.raw_user_meta_data->>'name',
                     split_part(NEW.email,'@',1));

  INSERT INTO public.tenants (owner_user_id, name)
  VALUES (NEW.id, v_name)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.subscriptions (tenant_id, status, current_period_end)
  VALUES (v_tenant_id, 'past_due', now());
  RETURN NEW;
END;
$function$;
