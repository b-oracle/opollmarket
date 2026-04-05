
-- Fix permissive community_messages UPDATE: restrict to own messages only
DROP POLICY IF EXISTS "Authenticated users can update reactions on community messages" ON public.community_messages;
CREATE POLICY "Users can update reactions on own community messages"
ON public.community_messages FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
