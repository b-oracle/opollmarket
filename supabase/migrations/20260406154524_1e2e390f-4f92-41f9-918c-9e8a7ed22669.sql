-- 1. CRITICAL: space_participants - prevent role escalation
DROP POLICY IF EXISTS "Users can update own participation" ON public.space_participants;
CREATE POLICY "Users can update own participation" ON public.space_participants
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND space_id = (SELECT sp.space_id FROM space_participants sp WHERE sp.id = space_participants.id)
  AND role = (SELECT sp.role FROM space_participants sp WHERE sp.id = space_participants.id)
);

-- 2. Spaces co-host: restrict to tagged_market_ids only
DROP POLICY IF EXISTS "Co-hosts can update tagged markets" ON public.spaces;
CREATE POLICY "Co-hosts can update tagged markets" ON public.spaces
FOR UPDATE TO authenticated
USING (auth.uid() = ANY (co_host_ids))
WITH CHECK (
  auth.uid() = ANY (co_host_ids)
  AND host_id = (SELECT s.host_id FROM spaces s WHERE s.id = spaces.id)
  AND status = (SELECT s.status FROM spaces s WHERE s.id = spaces.id)
  AND title = (SELECT s.title FROM spaces s WHERE s.id = spaces.id)
  AND NOT (co_host_ids IS DISTINCT FROM (SELECT s.co_host_ids FROM spaces s WHERE s.id = spaces.id))
);

-- 3. Limit orders: only allow status changes (for cancellation)
DROP POLICY IF EXISTS "Authenticated users can update own limit orders" ON public.limit_orders;
CREATE POLICY "Authenticated users can update own limit orders" ON public.limit_orders
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND amount = (SELECT lo.amount FROM limit_orders lo WHERE lo.id = limit_orders.id)
  AND limit_price = (SELECT lo.limit_price FROM limit_orders lo WHERE lo.id = limit_orders.id)
  AND shares = (SELECT lo.shares FROM limit_orders lo WHERE lo.id = limit_orders.id)
  AND market_id = (SELECT lo.market_id FROM limit_orders lo WHERE lo.id = limit_orders.id)
  AND side = (SELECT lo.side FROM limit_orders lo WHERE lo.id = limit_orders.id)
  AND NOT (option_id IS DISTINCT FROM (SELECT lo.option_id FROM limit_orders lo WHERE lo.id = limit_orders.id))
);

-- 4. Pending copy trades: lock financial fields
DROP POLICY IF EXISTS "Users can update own pending copy trades" ON public.pending_copy_trades;
CREATE POLICY "Users can update own pending copy trades" ON public.pending_copy_trades
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND amount = (SELECT pt.amount FROM pending_copy_trades pt WHERE pt.id = pending_copy_trades.id)
  AND trader_user_id = (SELECT pt.trader_user_id FROM pending_copy_trades pt WHERE pt.id = pending_copy_trades.id)
  AND NOT (market_id IS DISTINCT FROM (SELECT pt.market_id FROM pending_copy_trades pt WHERE pt.id = pending_copy_trades.id))
  AND trade_type = (SELECT pt.trade_type FROM pending_copy_trades pt WHERE pt.id = pending_copy_trades.id)
);