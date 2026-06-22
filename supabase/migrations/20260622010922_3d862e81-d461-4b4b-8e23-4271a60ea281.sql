
DROP POLICY IF EXISTS "auth upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "auth read receipts" ON storage.objects;
DROP POLICY IF EXISTS "auth update receipts" ON storage.objects;
DROP POLICY IF EXISTS "auth delete receipts" ON storage.objects;

CREATE POLICY "tenant read own receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "tenant upload own receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "tenant update own receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      OR public.has_role(auth.uid(), 'super_admin')
    )
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "tenant delete own receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );
