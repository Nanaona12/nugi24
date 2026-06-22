
CREATE POLICY "auth upload receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "auth read receipts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'receipts');
CREATE POLICY "auth update receipts" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'receipts');
