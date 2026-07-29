GRANT SELECT (id, username, display_name, avatar_url, bio, is_public, created_at, verification_level, wallet_address, twitter_username, twitter_avatar_url, interests) ON public.profiles TO anon;

DROP POLICY IF EXISTS "Anon can read public profiles" ON public.profiles;
CREATE POLICY "Anon can read public profiles"
ON public.profiles FOR SELECT TO anon
USING (is_public = true);