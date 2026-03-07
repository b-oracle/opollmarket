
-- Allow moderators to read moderation logs
CREATE POLICY "Moderators can read moderation logs"
ON public.moderation_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'moderator'::app_role));

-- Allow moderators to update moderation logs (review actions)
CREATE POLICY "Moderators can update moderation logs"
ON public.moderation_logs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'moderator'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'moderator'::app_role));
