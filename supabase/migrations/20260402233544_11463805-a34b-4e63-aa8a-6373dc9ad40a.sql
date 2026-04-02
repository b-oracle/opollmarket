
-- Fix the public_profiles view with correct columns
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, display_name, avatar_url, bio, verification_level, is_public, 
       created_at, interests, location, gender, age,
       social_tutorial_seen, twitter_username, twitter_linked_at,
       unlimited_markets, is_blocked
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;

-- Re-add a scoped profile read policy for authenticated users (needed for social features)
-- Since the broad one was dropped, we need authenticated to read all profiles for display_name/avatar lookups
CREATE POLICY "Authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- 2. SPACE_INVITES: Restrict INSERT to host/co-hosts only
DROP POLICY IF EXISTS "Inviters can insert" ON public.space_invites;
CREATE POLICY "Host or cohost can invite" ON public.space_invites FOR INSERT TO authenticated
  WITH CHECK (
    inviter_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.spaces s 
      WHERE s.id = space_id 
      AND (s.host_id = auth.uid() OR auth.uid() = ANY(COALESCE(s.co_host_ids, '{}'::uuid[])))
    )
  );

-- Restrict SELECT to participants only
DROP POLICY IF EXISTS "Anyone can read invites" ON public.space_invites;
CREATE POLICY "Participants can read invites" ON public.space_invites FOR SELECT TO authenticated
  USING (
    inviter_id = auth.uid() 
    OR invitee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.spaces s WHERE s.id = space_id AND s.host_id = auth.uid()
    )
  );

-- 3. BOOKMARKS: Remove broad SELECT
DROP POLICY IF EXISTS "Anyone can count bookmarks per market" ON public.bookmarks;

-- 4. SPACE_REMINDERS: Restrict to own
DROP POLICY IF EXISTS "Users can view reminders" ON public.space_reminders;
CREATE POLICY "Users can view own reminders" ON public.space_reminders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5. QUICK_ROUNDS: Remove public INSERT
DROP POLICY IF EXISTS "Authenticated users can create quick rounds" ON public.quick_rounds;

-- 6. COMMISSION_SETTINGS: Restrict to authenticated
DROP POLICY IF EXISTS "Anyone can read commission settings" ON public.commission_settings;
CREATE POLICY "Authenticated can read commission settings" ON public.commission_settings FOR SELECT TO authenticated
  USING (true);
