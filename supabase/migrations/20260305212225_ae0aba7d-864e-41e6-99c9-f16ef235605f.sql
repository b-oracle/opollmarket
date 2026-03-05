
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
WITH CHECK ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
