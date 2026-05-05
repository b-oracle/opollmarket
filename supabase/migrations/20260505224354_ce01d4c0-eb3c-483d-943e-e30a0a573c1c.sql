
-- Revert column-level revokes
GRANT SELECT (email, date_of_birth, gender, location, block_reason, blocked_at, is_blocked, kyc_status, wallet_address)
  ON public.profiles TO authenticated;

-- Tighten the row policy: only own row via this policy. Public/follower access
-- is now ONLY through the public_profiles view.
DROP POLICY IF EXISTS "Authenticated can read public profile rows" ON public.profiles;

-- Recreate view with security_invoker = off so it bypasses the now-restricted
-- table policies but only exposes safe columns and only for visible scope.
DROP VIEW IF EXISTS public.public_profiles CASCADE;

CREATE VIEW public.public_profiles
WITH (security_invoker = off)
AS
SELECT
  id, display_name, username, avatar_url, bio, is_public, verification_level,
  twitter_username, twitter_avatar_url, unlimited_markets, created_at, age, interests
FROM public.profiles
WHERE
  is_public = true
  OR id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.follows f
    WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
       OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
  );

GRANT SELECT ON public.public_profiles TO authenticated, anon;
