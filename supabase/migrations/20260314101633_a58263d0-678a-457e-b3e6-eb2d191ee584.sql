
-- Add super_admin SELECT policies to tables used by User Activity Drawer

CREATE POLICY "Super admins can read all transactions"
ON public.transactions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can read all positions"
ON public.positions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can read all quick bets"
ON public.quick_bets FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can read all referral rewards"
ON public.referral_rewards FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can read all withdrawal requests"
ON public.withdrawal_requests FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can read all balances"
ON public.balances FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));
