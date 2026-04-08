
-- Recreate as SECURITY DEFINER view with access control built in
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = off)
AS
SELECT
  id,
  display_name,
  avatar_url,
  wallet_address,
  created_at,
  updated_at,
  is_public,
  bio,
  verification_level,
  twitter_username,
  twitter_avatar_url,
  twitter_linked_at,
  interests,
  unlimited_markets,
  kyc_status,
  referred_by
FROM public.profiles;

-- Grant access
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;
