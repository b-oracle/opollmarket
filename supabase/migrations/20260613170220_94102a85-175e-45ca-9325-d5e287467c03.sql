
-- 1) notification_email_outbox: explicit admin SELECT policy
CREATE POLICY "Admins can read email outbox"
  ON public.notification_email_outbox
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2) bot_link_tokens: explicit deny-all to anon/authenticated (service_role bypasses RLS)
CREATE POLICY "Deny client reads on bot link tokens"
  ON public.bot_link_tokens
  FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "Deny client inserts on bot link tokens"
  ON public.bot_link_tokens
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client updates on bot link tokens"
  ON public.bot_link_tokens
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny client deletes on bot link tokens"
  ON public.bot_link_tokens
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- 3) notifications: restrict self-INSERT to a safe allowlist of types,
--    blocking financial / security / admin-looking notification types from being self-injected.
DROP POLICY IF EXISTS "Users can insert own notifications only" ON public.notifications;

CREATE POLICY "Users can insert safe own notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND actor_id = auth.uid()
    AND type IN (
      'info',
      'mention',
      'space_invite',
      'space_unbanned',
      'first_prediction_required'
    )
  );
