
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT
  id,
  display_name,
  avatar_url,
  bio,
  is_public,
  verification_level,
  wallet_address,
  twitter_username,
  twitter_avatar_url,
  created_at,
  updated_at,
  referred_by,
  interests,
  social_tutorial_seen,
  unlimited_markets,
  kyc_status,
  is_blocked
FROM public.profiles;
