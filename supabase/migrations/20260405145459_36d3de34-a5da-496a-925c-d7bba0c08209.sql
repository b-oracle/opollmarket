CREATE POLICY "Authenticated users can update reactions on community messages"
ON public.community_messages
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);