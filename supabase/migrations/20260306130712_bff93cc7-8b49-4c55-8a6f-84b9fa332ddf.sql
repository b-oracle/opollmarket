CREATE POLICY "Anyone can count bookmarks per market"
ON public.bookmarks
FOR SELECT
TO authenticated
USING (true);