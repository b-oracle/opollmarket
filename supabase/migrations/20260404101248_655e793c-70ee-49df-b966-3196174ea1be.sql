
-- Fix market-images UPDATE policy
CREATE POLICY "Users can update own images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'market-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'market-images' AND (storage.foldername(name))[1] = auth.uid()::text);
