
-- Create market-images storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('market-images', 'market-images', true);

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload market images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'market-images');

-- Allow public read access
CREATE POLICY "Public read access for market images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'market-images');

-- Allow admins to delete market images
CREATE POLICY "Admins can delete market images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'market-images' AND public.has_role(auth.uid(), 'admin'));
