
-- =============================================
-- FIX 2: Profiles PII - drop and recreate view without sensitive columns
-- =============================================
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = on) AS
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
    interests,
    location,
    created_at,
    kyc_status,
    social_tutorial_seen,
    unlimited_markets,
    updated_at
  FROM public.profiles;

-- Drop overlapping broad policies that leak PII
DROP POLICY IF EXISTS "Authenticated can read basic profile info" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can read public profile basics" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;

-- Consolidated safe policy: own profile + admin/moderator access only
CREATE POLICY "Users can read own full profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'moderator')
    OR has_role(auth.uid(), 'super_admin')
  );

-- =============================================
-- FIX 4: Limit orders - create safe orderbook view
-- =============================================
CREATE OR REPLACE VIEW public.public_orderbook
WITH (security_invoker = on) AS
  SELECT
    id,
    market_id,
    option_id,
    side,
    order_type,
    limit_price,
    amount,
    shares,
    status,
    created_at
  FROM public.limit_orders
  WHERE status = 'pending';

DROP POLICY IF EXISTS "Authenticated can read pending limit orders for orderbook" ON public.limit_orders;

-- =============================================
-- FIX 5: Space recordings bucket - make private
-- =============================================
UPDATE storage.buckets SET public = false WHERE name = 'space-recordings';

-- =============================================
-- FIX 6: Spaces - change policy from public to authenticated
-- =============================================
DROP POLICY IF EXISTS "Users can read own and network spaces" ON public.spaces;

CREATE POLICY "Users can read own and network spaces"
  ON public.spaces FOR SELECT TO authenticated
  USING (
    auth.uid() = host_id
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE (f.follower_id = auth.uid() AND f.following_id = spaces.host_id)
         OR (f.follower_id = spaces.host_id AND f.following_id = auth.uid())
    )
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'super_admin')
  );
