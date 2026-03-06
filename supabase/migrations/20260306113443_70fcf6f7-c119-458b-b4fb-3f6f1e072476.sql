
-- ============================================
-- 1. BALANCES: Remove user INSERT and UPDATE policies
--    Only service role (edge functions) should modify balances
-- ============================================

-- Drop the user insert policy
DROP POLICY IF EXISTS "System can insert balances" ON public.balances;

-- Drop the user update policy  
DROP POLICY IF EXISTS "System can update balances" ON public.balances;

-- ============================================
-- 2. POSITIONS: Remove user INSERT and UPDATE policies
--    Only service role (edge functions) should modify positions
-- ============================================

DROP POLICY IF EXISTS "Users can insert own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can update own positions" ON public.positions;

-- ============================================
-- 3. REFERRAL_REWARDS: Remove user INSERT policy
--    Only the database trigger (handle_referral_reward) should insert rewards
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can insert referral rewards" ON public.referral_rewards;

-- ============================================
-- 4. LIMIT_ORDERS: Change policies from public to authenticated role
-- ============================================

-- Drop existing policies that target public role
DROP POLICY IF EXISTS "Users can insert own limit orders" ON public.limit_orders;
DROP POLICY IF EXISTS "Users can update own limit orders" ON public.limit_orders;
DROP POLICY IF EXISTS "Users can read own limit orders" ON public.limit_orders;
DROP POLICY IF EXISTS "Anyone can read pending limit orders" ON public.limit_orders;

-- Recreate with authenticated role
CREATE POLICY "Authenticated users can insert own limit orders"
  ON public.limit_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own limit orders"
  ON public.limit_orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read own limit orders"
  ON public.limit_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read pending limit orders"
  ON public.limit_orders FOR SELECT
  TO authenticated
  USING (status = 'pending');

-- ============================================
-- 5. TRANSACTIONS: Hide user_id from public trade reads
--    Replace the public trade policy with one scoped to authenticated
-- ============================================

DROP POLICY IF EXISTS "Anyone can read market trades" ON public.transactions;

CREATE POLICY "Authenticated can read market trades"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (type IN ('buy', 'sell') AND status = 'confirmed');
