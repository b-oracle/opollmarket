
-- Create storage bucket for space recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('space-recordings', 'space-recordings', false);

-- Allow authenticated users to upload recordings (hosts only enforced in app)
CREATE POLICY "Users can upload space recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'space-recordings');

-- Allow authenticated users to read recordings
CREATE POLICY "Users can read space recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'space-recordings');

-- Allow owners to delete their recordings
CREATE POLICY "Users can delete their recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'space-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
