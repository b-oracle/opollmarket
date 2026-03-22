CREATE POLICY "Users can update own views"
ON public.status_views
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);