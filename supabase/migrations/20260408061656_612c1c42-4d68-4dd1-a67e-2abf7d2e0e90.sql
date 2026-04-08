
-- Drop existing view and recreate
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
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

-- Drop the overly permissive policy that exposes all columns to non-owners
DROP POLICY IF EXISTS "Authenticated can read public profiles" ON public.profiles;

-- Add policy: regular users can only read their own row from profiles directly
CREATE POLICY "Authenticated can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Grant select on the safe view
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;
