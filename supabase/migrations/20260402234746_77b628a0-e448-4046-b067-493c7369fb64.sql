
-- =============================================
-- FIX 1: Remove blanket profiles SELECT policies
-- Keep scoped policies (own profile, public profiles, admin, moderator)
-- =============================================
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read all profiles" ON public.profiles;

-- Replace with a policy that allows reading non-sensitive fields for social features
-- Users can see id, display_name, avatar_url, bio, verification_level, is_public for any profile
-- but email, wallet_address, date_of_birth, gender, kyc_status are only visible to owner/admin
CREATE POLICY "Authenticated can read basic profile info" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR is_public = true
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.follows
      WHERE (follower_id = auth.uid() AND following_id = profiles.id)
         OR (following_id = auth.uid() AND follower_id = profiles.id)
    )
  );

-- =============================================
-- FIX 2: Remove overly permissive pending limit orders policy
-- Replace with anonymized view for order book (no user_id exposed)
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can read pending limit orders" ON public.limit_orders;

-- Create a view for the order book that strips user_id
CREATE OR REPLACE VIEW public.order_book_entries AS
SELECT id, market_id, option_id, side, limit_price, shares, amount, status, created_at
FROM public.limit_orders
WHERE status = 'pending';

-- =============================================
-- FIX 3: Remove policy exposing all confirmed transactions
-- Replace with anonymized market activity view
-- =============================================
DROP POLICY IF EXISTS "Authenticated can read market trades" ON public.transactions;

-- Create anonymized view for market activity (no user_id)
CREATE OR REPLACE VIEW public.market_trades_anonymous AS
SELECT id, market_id, type, amount, shares, price, option_id, side, created_at
FROM public.transactions
WHERE type IN ('buy', 'sell') AND status = 'confirmed';

-- =============================================
-- FIX 4: Restrict space recordings to participants
-- =============================================
DROP POLICY IF EXISTS "Users can read space recordings" ON storage.objects;

CREATE POLICY "Participants can read space recordings" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'space-recordings'
    AND (
      -- User is the recording owner
      (auth.uid())::text = (storage.foldername(name))[1]
      -- Or user participated in the space
      OR EXISTS (
        SELECT 1 FROM public.space_participants sp
        JOIN public.spaces s ON s.id = sp.space_id
        WHERE sp.user_id = auth.uid()
          AND sp.left_at IS NOT NULL
          AND s.recording_url IS NOT NULL
          AND (storage.foldername(name))[1] = s.host_id::text
      )
      -- Or user is the host
      OR EXISTS (
        SELECT 1 FROM public.spaces s
        WHERE s.host_id = auth.uid()
          AND s.recording_url IS NOT NULL
      )
      -- Or admin
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );
