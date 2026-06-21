
-- Remove free trial: change default and update existing trialing subs to past_due (force payment)
ALTER TABLE public.subscriptions ALTER COLUMN status SET DEFAULT 'past_due';
ALTER TABLE public.subscriptions ALTER COLUMN current_period_end SET DEFAULT now();

-- Set existing untouched trialing subs to past_due
UPDATE public.subscriptions SET status = 'past_due', current_period_end = now()
WHERE status = 'trialing';

-- Update handle_new_user to NOT give trial period
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  -- No trial: subscription starts as past_due, must pay (optionally with coupon)
  INSERT INTO public.subscriptions (tenant_id, status, current_period_end)
  VALUES (v_tenant_id, 'past_due', now());
  RETURN NEW;
END;
$function$;

-- Coupons table
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_percent integer NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Only super admin can manage; authenticated users can read active ones for validation
CREATE POLICY "Super admin manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated read active coupons" ON public.coupons
  FOR SELECT TO authenticated
  USING (active = true);

CREATE TRIGGER coupons_set_updated_at BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Track coupon usage on payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS discount_percent integer;
