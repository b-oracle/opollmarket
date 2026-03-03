-- Tighten RLS policies

-- 1. comment_likes: require authenticated users
DROP POLICY IF EXISTS "Anyone can insert comment likes" ON public.comment_likes;
CREATE POLICY "Authenticated users can insert comment likes" ON public.comment_likes
FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete own comment likes" ON public.comment_likes;
CREATE POLICY "Authenticated users can delete own comment likes" ON public.comment_likes
FOR DELETE TO authenticated USING (true);

-- 2. market_boosts: require authenticated users for insert/update
DROP POLICY IF EXISTS "Anyone can create boosts" ON public.market_boosts;
CREATE POLICY "Authenticated users can create boosts" ON public.market_boosts
FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Boosts can be updated" ON public.market_boosts;
CREATE POLICY "Admins can update boosts" ON public.market_boosts
FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. market_options: restrict insert/update to admins
DROP POLICY IF EXISTS "Anyone can insert market options" ON public.market_options;
CREATE POLICY "Admins can insert market options" ON public.market_options
FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Market options can be updated" ON public.market_options;
CREATE POLICY "Admins can update market options" ON public.market_options
FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. markets: fix overly permissive creator update policy
DROP POLICY IF EXISTS "Creators can update own markets" ON public.markets;

-- 5. comments: require auth for insert
DROP POLICY IF EXISTS "Anyone can insert comments" ON public.comments;
CREATE POLICY "Authenticated users can insert comments" ON public.comments
FOR INSERT TO authenticated WITH CHECK (true);

-- 6. referral_rewards: require auth for insert
DROP POLICY IF EXISTS "Users can insert referral rewards" ON public.referral_rewards;
CREATE POLICY "Authenticated users can insert referral rewards" ON public.referral_rewards
FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);

-- 7. Add resolved_side and winning_option_id columns to markets for resolution tracking
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS resolved_side text;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS winning_option_id uuid REFERENCES public.market_options(id);
