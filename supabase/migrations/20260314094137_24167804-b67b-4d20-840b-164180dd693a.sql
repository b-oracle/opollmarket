
-- Create prediction leaderboard function based on settled transactions
-- Profit = (payouts + refunds) - wagers, only from resolved/settled transactions

CREATE OR REPLACE FUNCTION public.get_prediction_leaderboard(
  _limit integer DEFAULT 20,
  _sort text DEFAULT 'pnl',
  _cutoff timestamp with time zone DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  verification_level text,
  pnl numeric,
  volume numeric,
  trades bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.user_id,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.avatar_url,
    COALESCE(p.verification_level, 'none') AS verification_level,
    -- Profit = payouts received - amount wagered (buys)
    COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN t.type = 'refund' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    AS pnl,
    -- Volume = total amount wagered
    COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0) AS volume,
    -- Trades = number of buy transactions
    COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed') AS trades
  FROM transactions t
  LEFT JOIN profiles p ON p.id = t.user_id
  WHERE t.type IN ('buy', 'payout', 'refund')
    AND t.status = 'confirmed'
    AND t.market_id IS NOT NULL
    AND (_cutoff IS NULL OR t.created_at >= _cutoff)
  GROUP BY t.user_id, p.display_name, p.avatar_url, p.verification_level
  HAVING COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed') > 0
  ORDER BY
    CASE WHEN _sort = 'pnl' THEN
      COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.type = 'refund' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    WHEN _sort = 'volume' THEN
      COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    WHEN _sort = 'trades' THEN
      COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed')::numeric
    ELSE
      COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.type = 'refund' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0)
    END DESC
  LIMIT _limit;
$$;
