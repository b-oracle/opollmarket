
DROP VIEW IF EXISTS public.public_profiles CASCADE;

CREATE VIEW public.public_profiles
WITH (security_invoker = on)
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

CREATE POLICY "Authenticated can read public profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM public.follows f
      WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
         OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
    )
  );
