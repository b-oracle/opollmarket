-- 1. Tighten follows RLS
DROP POLICY IF EXISTS "Users can insert own follows" ON public.follows;
CREATE POLICY "Users can insert own follows" ON public.follows
FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can delete own follows" ON public.follows;
CREATE POLICY "Users can delete own follows" ON public.follows
FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- 2. Tighten pending_copy_trades RLS
DROP POLICY IF EXISTS "Users can read own pending copy trades" ON public.pending_copy_trades;
CREATE POLICY "Users can read own pending copy trades" ON public.pending_copy_trades
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own pending copy trades" ON public.pending_copy_trades;
CREATE POLICY "Users can update own pending copy trades" ON public.pending_copy_trades
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Tighten copy_trade_earnings RLS
DROP POLICY IF EXISTS "Admins can read all copy earnings" ON public.copy_trade_earnings;
CREATE POLICY "Admins can read all copy earnings" ON public.copy_trade_earnings
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Copiers can read own copy earnings" ON public.copy_trade_earnings;
CREATE POLICY "Copiers can read own copy earnings" ON public.copy_trade_earnings
FOR SELECT TO authenticated USING (auth.uid() = copier_user_id);

DROP POLICY IF EXISTS "Traders can read own copy earnings" ON public.copy_trade_earnings;
CREATE POLICY "Traders can read own copy earnings" ON public.copy_trade_earnings
FOR SELECT TO authenticated USING (auth.uid() = trader_user_id);

-- 4. Tighten limit_orders admin SELECT
DROP POLICY IF EXISTS "Admins can read all limit orders" ON public.limit_orders;
CREATE POLICY "Admins can read all limit orders" ON public.limit_orders
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read pending limit orders" ON public.limit_orders;
CREATE POLICY "Authenticated users can read pending limit orders" ON public.limit_orders
FOR SELECT TO authenticated USING (status = 'pending'::text);

-- 5. Extend deposit expiry from 2hrs to 4hrs
CREATE OR REPLACE FUNCTION public.expire_stale_pending_deposits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.transactions
  SET status = 'expired'
  WHERE type = 'deposit'
    AND status = 'pending'
    AND created_at < now() - interval '4 hours';

  UPDATE public.market_boosts
  SET status = 'expired'
  WHERE status = 'pending'
    AND created_at < now() - interval '4 hours';
END;
$$;