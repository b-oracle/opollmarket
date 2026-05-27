
-- 1. Profiles PII: revoke table-level SELECT from anon/authenticated; rely on
-- column-level grants already in place for safe columns. Owners/admins read
-- the full row via dedicated RPCs / admin policies (table-level grant is kept
-- for service_role and the explicit column grants for authenticated).
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- Re-grant column-level SELECT on safe public columns to authenticated (idempotent).
GRANT SELECT (
  id, display_name, avatar_url, created_at, updated_at, is_public, bio,
  social_tutorial_seen, verification_level, twitter_username, twitter_avatar_url,
  twitter_linked_at, interests, unlimited_markets, username
) ON public.profiles TO authenticated;

-- 2. Space recordings storage policy: allow both current and past participants
-- (remove the erroneous `left_at IS NOT NULL` filter that excluded active users).
DROP POLICY IF EXISTS "Participants can read space recordings" ON storage.objects;
CREATE POLICY "Participants can read space recordings"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'space-recordings'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.host_id = auth.uid() AND s.recording_url = objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.space_participants sp
      JOIN public.spaces s ON s.id = sp.space_id
      WHERE sp.user_id = auth.uid() AND s.recording_url = objects.name
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- 3. Realtime broadcast: drop the broad public:* allowance. Authenticated
-- subscribers are now limited to their own user/private topics. Service role
-- bypasses RLS for any server-side fan-out, and postgres_changes channels
-- are scoped per subscription, not via realtime.messages topics.
DROP POLICY IF EXISTS "Authenticated can read own scoped topics" ON realtime.messages;
CREATE POLICY "Authenticated can read own scoped topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE ('user:' || (auth.uid())::text)
  OR realtime.topic() LIKE ('user:' || (auth.uid())::text || ':%')
  OR realtime.topic() LIKE ('private:' || (auth.uid())::text || ':%')
);
