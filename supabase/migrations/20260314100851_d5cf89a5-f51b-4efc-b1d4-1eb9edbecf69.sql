
CREATE OR REPLACE FUNCTION public.get_admin_user_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_balance', COALESCE((SELECT SUM(amount) FROM public.balances), 0),
    'total_deposits', COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'deposit' AND status = 'confirmed'), 0),
    'total_withdrawals', COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'withdrawal' AND status = 'confirmed'), 0),
    'total_earnings', 
      COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'payout' AND status = 'confirmed'), 0)
      + COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'refund' AND status = 'confirmed'), 0)
      + COALESCE((SELECT SUM(payout) FROM public.quick_bets WHERE status = 'won'), 0)
      + COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'qt_one_sided_bonus' AND status = 'confirmed'), 0)
      + COALESCE((SELECT SUM(commission_amount) FROM public.copy_trade_earnings), 0)
      + COALESCE((SELECT SUM(amount) FROM public.referral_rewards), 0),
    'total_losses',
      COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'buy' AND status = 'confirmed' AND market_id IS NOT NULL), 0)
      - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'payout' AND status = 'confirmed'), 0)
      - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'refund' AND status = 'confirmed'), 0)
      + COALESCE((SELECT SUM(amount) FROM public.quick_bets WHERE status = 'lost'), 0)
  );
$$;
