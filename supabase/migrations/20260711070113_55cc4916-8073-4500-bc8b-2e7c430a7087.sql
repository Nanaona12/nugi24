CREATE POLICY "Super admins can view all bookkeeping entries"
ON public.bookkeeping_entries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));