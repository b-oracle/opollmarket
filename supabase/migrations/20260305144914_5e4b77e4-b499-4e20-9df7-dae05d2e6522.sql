
-- Tighten INSERT policies to require matching user_id
DROP POLICY "Service can insert moderation logs" ON public.moderation_logs;
DROP POLICY "Anon can insert moderation logs" ON public.moderation_logs;

-- Authenticated users can only insert logs for themselves
CREATE POLICY "Users can insert own moderation logs"
  ON public.moderation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert any moderation logs
CREATE POLICY "Admins can insert moderation logs"
  ON public.moderation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
