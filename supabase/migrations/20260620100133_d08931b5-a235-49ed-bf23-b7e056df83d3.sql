-- Restrict peer access to sensitive profile columns via column-level GRANTs.
-- RLS allows public profile rows to be readable by authenticated users, but column
-- grants further restrict which columns may be selected. Owners and admins read
-- sensitive fields via SECURITY DEFINER helpers (e.g. get_my_full_profile) and
-- server-side service_role clients (which bypass column grants).

REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id,
  username,
  display_name,
  avatar_url,
  bio,
  verification_level,
  twitter_username,
  twitter_id,
  twitter_avatar_url,
  twitter_linked_at,
  wallet_address,
  is_public,
  social_tutorial_seen,
  unlimited_markets,
  interests,
  referred_by,
  created_at,
  updated_at
) ON public.profiles TO authenticated;
