
DROP POLICY IF EXISTS "Users can update reactions on own community messages" ON public.community_messages;

CREATE POLICY "Authenticated users can update reactions"
ON public.community_messages
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
