-- 1) Profiles: restrict PII at column level.
-- RLS already limits which rows are visible (own profile, public profiles,
-- mutual follows, admins) but column-level grants are needed to keep email,
-- age, gender, location, date_of_birth, kyc_status and block fields hidden
-- from other signed-in users. Owners read their own PII via the
-- get_my_full_profile() SECURITY DEFINER RPC, which bypasses column grants.
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id,
  display_name,
  username,
  avatar_url,
  bio,
  is_public,
  created_at,
  updated_at,
  wallet_address,
  verification_level,
  twitter_username,
  twitter_id,
  twitter_avatar_url,
  twitter_linked_at,
  interests,
  unlimited_markets,
  social_tutorial_seen,
  referred_by,
  is_blocked
) ON public.profiles TO authenticated;

-- Owner updates still need column-level UPDATE grants on editable fields.
-- (RLS "Users can update own profile" enforces auth.uid() = id.)
GRANT UPDATE (
  display_name,
  username,
  avatar_url,
  bio,
  is_public,
  wallet_address,
  twitter_username,
  twitter_id,
  twitter_avatar_url,
  twitter_linked_at,
  interests,
  social_tutorial_seen,
  age,
  gender,
  location,
  date_of_birth
) ON public.profiles TO authenticated;

-- service_role keeps full table access for edge functions / admin code.
GRANT ALL ON public.profiles TO service_role;

-- 2) app_settings: restrict reads to admins / super_admins.
DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON public.app_settings;
CREATE POLICY "Admins can read app_settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);