
-- ============================================================
-- FIX: Recreate all restrictive RLS policies as permissive
-- ============================================================

-- ── analytics_events ──
DROP POLICY IF EXISTS "Admins can read all analytics events" ON public.analytics_events;
DROP POLICY IF EXISTS "Anonymous can insert analytics events" ON public.analytics_events;
DROP POLICY IF EXISTS "Users can insert own analytics events" ON public.analytics_events;

CREATE POLICY "Admins can read all analytics events" ON public.analytics_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anonymous can insert analytics events" ON public.analytics_events FOR INSERT TO anon WITH CHECK (user_id IS NULL);
CREATE POLICY "Users can insert own analytics events" ON public.analytics_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── balances ──
DROP POLICY IF EXISTS "Admins can read all balances" ON public.balances;
DROP POLICY IF EXISTS "System can insert balances" ON public.balances;
DROP POLICY IF EXISTS "System can update balances" ON public.balances;
DROP POLICY IF EXISTS "Users can read own balance" ON public.balances;

CREATE POLICY "Users can read own balance" ON public.balances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all balances" ON public.balances FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert balances" ON public.balances FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "System can update balances" ON public.balances FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── comment_likes ──
DROP POLICY IF EXISTS "Anyone can read comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can delete own comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can insert own comment likes" ON public.comment_likes;

CREATE POLICY "Anyone can read comment likes" ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "Users can delete own comment likes" ON public.comment_likes FOR DELETE TO authenticated USING ((auth.uid())::text = wallet_address);
CREATE POLICY "Users can insert own comment likes" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK ((auth.uid())::text = wallet_address);

-- ── comments ──
DROP POLICY IF EXISTS "Admins can delete comments" ON public.comments;
DROP POLICY IF EXISTS "Anyone can read comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments;

CREATE POLICY "Anyone can read comments" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert comments" ON public.comments FOR INSERT TO authenticated WITH CHECK ((auth.uid())::text = author_wallet);
CREATE POLICY "Admins can delete comments" ON public.comments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ── commission_settings ──
DROP POLICY IF EXISTS "Admins can update commission settings" ON public.commission_settings;
DROP POLICY IF EXISTS "Authenticated users can read commission settings" ON public.commission_settings;

CREATE POLICY "Authenticated users can read commission settings" ON public.commission_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update commission settings" ON public.commission_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ── market_boosts ──
DROP POLICY IF EXISTS "Admins can update boosts" ON public.market_boosts;
DROP POLICY IF EXISTS "Authenticated users can create boosts" ON public.market_boosts;
DROP POLICY IF EXISTS "Boosts are publicly readable" ON public.market_boosts;

CREATE POLICY "Boosts are publicly readable" ON public.market_boosts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create boosts" ON public.market_boosts FOR INSERT TO authenticated WITH CHECK ((auth.uid())::text = payer_wallet);
CREATE POLICY "Admins can update boosts" ON public.market_boosts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ── market_likes ──
DROP POLICY IF EXISTS "Market likes are publicly readable" ON public.market_likes;
DROP POLICY IF EXISTS "Users can delete own market likes" ON public.market_likes;
DROP POLICY IF EXISTS "Users can insert own market likes" ON public.market_likes;

CREATE POLICY "Market likes are publicly readable" ON public.market_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert own market likes" ON public.market_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own market likes" ON public.market_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── market_options ──
DROP POLICY IF EXISTS "Admins can insert market options" ON public.market_options;
DROP POLICY IF EXISTS "Admins can update market options" ON public.market_options;
DROP POLICY IF EXISTS "Market options are publicly readable" ON public.market_options;

CREATE POLICY "Market options are publicly readable" ON public.market_options FOR SELECT USING (true);
CREATE POLICY "Admins can insert market options" ON public.market_options FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update market options" ON public.market_options FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ── markets ──
DROP POLICY IF EXISTS "Admins can delete markets" ON public.markets;
DROP POLICY IF EXISTS "Admins can update any market" ON public.markets;
DROP POLICY IF EXISTS "Authenticated users can create markets" ON public.markets;
DROP POLICY IF EXISTS "Markets are publicly readable" ON public.markets;

CREATE POLICY "Markets are publicly readable" ON public.markets FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create markets" ON public.markets FOR INSERT TO authenticated WITH CHECK ((auth.uid())::text = creator_wallet);
CREATE POLICY "Admins can update any market" ON public.markets FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete markets" ON public.markets FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ── notifications ──
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── positions ──
DROP POLICY IF EXISTS "Admins can read all positions" ON public.positions;
DROP POLICY IF EXISTS "Users can insert own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can read own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can update own positions" ON public.positions;

CREATE POLICY "Users can read own positions" ON public.positions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all positions" ON public.positions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own positions" ON public.positions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own positions" ON public.positions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── profiles ──
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── referral_rewards ──
DROP POLICY IF EXISTS "Admins can read all referral rewards" ON public.referral_rewards;
DROP POLICY IF EXISTS "Authenticated users can insert referral rewards" ON public.referral_rewards;
DROP POLICY IF EXISTS "Users can read own referral rewards" ON public.referral_rewards;

CREATE POLICY "Users can read own referral rewards" ON public.referral_rewards FOR SELECT TO authenticated USING (auth.uid() = referrer_id);
CREATE POLICY "Admins can read all referral rewards" ON public.referral_rewards FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can insert referral rewards" ON public.referral_rewards FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);

-- ── transactions (fix remaining restrictive policies) ──
DROP POLICY IF EXISTS "Admins can read all transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can read own transactions" ON public.transactions;

CREATE POLICY "Users can read own transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all transactions" ON public.transactions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── user_roles ──
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ── withdrawal_requests ──
DROP POLICY IF EXISTS "Admins can read all withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Admins can update withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Users can insert own withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Users can read own withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY "Users can read own withdrawal requests" ON public.withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all withdrawal requests" ON public.withdrawal_requests FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own withdrawal requests" ON public.withdrawal_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update withdrawal requests" ON public.withdrawal_requests FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
