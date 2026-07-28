CREATE POLICY "tenant read own product-photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-photos'
  AND (storage.foldername(name))[1] = public.current_tenant_id()::text
);