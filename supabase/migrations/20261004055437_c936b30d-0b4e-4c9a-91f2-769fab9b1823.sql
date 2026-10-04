ALTER TABLE public.cashier_shifts
  ADD COLUMN IF NOT EXISTS shortage_resolution text,
  ADD COLUMN IF NOT EXISTS shortage_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS shortage_resolved_by uuid,
  ADD COLUMN IF NOT EXISTS shortage_debt_id uuid;

ALTER TABLE public.shift_expenses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_note text;

CREATE INDEX IF NOT EXISTS idx_shift_expenses_pending ON public.shift_expenses(tenant_id, approval_status);