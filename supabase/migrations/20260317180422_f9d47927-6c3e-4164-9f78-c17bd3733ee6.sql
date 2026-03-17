
-- Fix get_prediction_leaderboard: exclude initial_liquidity and broadcast_fee from PNL
CREATE OR REPLACE FUNCTION public.get_prediction_leaderboard(_limit integer DEFAULT 20, _sort text DEFAULT 'pnl'::text, _cutoff timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, verification_level text, pnl numeric, volume numeric, trades bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.user_id,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.avatar_url,
    COALESCE(p.verification_level, 'none') AS verification_level,
    COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN t.type = 'refund' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no') THEN t.amount ELSE 0 END), 0)
    AS pnl,
    COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no') THEN t.amount ELSE 0 END), 0) AS volume,
    COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no')) AS trades
  FROM transactions t
  LEFT JOIN profiles p ON p.id = t.user_id
  WHERE t.type IN ('buy', 'payout', 'refund')
    AND t.status = 'confirmed'
    AND t.market_id IS NOT NULL
    AND (_cutoff IS NULL OR t.created_at >= _cutoff)
  GROUP BY t.user_id, p.display_name, p.avatar_url, p.verification_level
  HAVING COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no')) > 0
  ORDER BY
    CASE WHEN _sort = 'pnl' THEN
      COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.type = 'refund' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no') THEN t.amount ELSE 0 END), 0)
    WHEN _sort = 'volume' THEN
      COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no') THEN t.amount ELSE 0 END), 0)
    WHEN _sort = 'trades' THEN
      COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no'))::numeric
    ELSE
      COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.type = 'refund' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no') THEN t.amount ELSE 0 END), 0)
    END DESC
  LIMIT _limit;
$function$;

-- Fix get_admin_user_stats: exclude initial_liquidity and broadcast_fee from total_losses
CREATE OR REPLACE FUNCTION public.get_admin_user_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'buy' AND status = 'confirmed' AND market_id IS NOT NULL AND side IN ('yes', 'no')), 0)
      - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'payout' AND status = 'confirmed'), 0)
      - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'refund' AND status = 'confirmed'), 0)
      + COALESCE((SELECT SUM(amount) FROM public.quick_bets WHERE status = 'lost'), 0)
  );
$function$;
