
-- 1. Fix notifications INSERT: prevent spoofing user_id (users can only insert for themselves as actor, NOT target other users)
DROP POLICY IF EXISTS "Users can insert notifications as actor" ON public.notifications;
CREATE POLICY "Users can insert own notifications only"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() AND user_id = auth.uid());

-- 2. Fix positions UPDATE: users should NOT be able to modify shares/avg_price directly
DROP POLICY IF EXISTS "Users can update own positions" ON public.positions;
-- No user-facing update policy; only service_role can update positions

-- 3. Fix transactions INSERT: restrict status to pending only, prevent spoofing confirmed/is_copy_trade
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions safely"
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND COALESCE(is_copy_trade, false) = false
);

-- 4. Fix withdrawal_requests INSERT: restrict status to pending only
DROP POLICY IF EXISTS "Users can insert own withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users can insert own pending withdrawal requests"
ON public.withdrawal_requests FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
);
