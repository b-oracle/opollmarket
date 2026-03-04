-- 1. POSITIONS: Remove overly permissive public SELECT, replace with admin-only aggregate read
DROP POLICY IF EXISTS "Public aggregate positions" ON public.positions;

CREATE POLICY "Admins can read all positions"
ON public.positions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. REFERRAL_REWARDS: Remove public leaderboard policy that exposes user IDs
DROP POLICY IF EXISTS "Public can read referral rewards for leaderboard" ON public.referral_rewards;

-- 3. COMMENT_LIKES: Fix DELETE policy to only allow deleting own likes
DROP POLICY IF EXISTS "Authenticated users can delete own comment likes" ON public.comment_likes;

CREATE POLICY "Users can delete own comment likes"
ON public.comment_likes
FOR DELETE
TO authenticated
USING (auth.uid()::text = wallet_address);

-- Fix INSERT policy to only allow inserting own likes
DROP POLICY IF EXISTS "Authenticated users can insert comment likes" ON public.comment_likes;

CREATE POLICY "Users can insert own comment likes"
ON public.comment_likes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = wallet_address);

-- 4. NOTIFICATIONS: Restrict INSERT to service role only (drop permissive policy)
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- 5. COMMENTS: Restrict INSERT to authenticated users with proper user check
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments;

CREATE POLICY "Authenticated users can insert comments"
ON public.comments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = author_wallet);

-- 6. MARKETS: Restrict market creation to authenticated users
DROP POLICY IF EXISTS "Anyone can create markets" ON public.markets;

CREATE POLICY "Authenticated users can create markets"
ON public.markets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = creator_wallet);