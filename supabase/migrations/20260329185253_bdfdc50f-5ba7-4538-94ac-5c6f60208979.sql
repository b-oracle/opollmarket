CREATE OR REPLACE FUNCTION public.get_prediction_leaderboard(_limit integer DEFAULT 20, _sort text DEFAULT 'pnl'::text, _cutoff timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, verification_level text, pnl numeric, volume numeric, trades bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH user_txns AS (
    SELECT
      t.user_id,
      COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0) AS payouts,
      COALESCE(SUM(CASE WHEN t.type = 'refund' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0) AS refunds,
      COALESCE(SUM(CASE WHEN t.type = 'sell' AND t.status = 'confirmed' THEN t.amount ELSE 0 END), 0) AS sells,
      COALESCE(SUM(CASE WHEN t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no') THEN t.amount ELSE 0 END), 0) AS total_buys,
      COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no')) AS trade_count
    FROM transactions t
    WHERE t.type IN ('buy', 'payout', 'refund', 'sell')
      AND t.status = 'confirmed'
      AND t.market_id IS NOT NULL
      AND (_cutoff IS NULL OR t.created_at >= _cutoff)
    GROUP BY t.user_id
    HAVING COUNT(*) FILTER (WHERE t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no')) > 0
  ),
  -- Cost of buys where user still holds active positions (open wagers)
  open_buy_cost AS (
    SELECT
      t.user_id,
      COALESCE(SUM(t.amount), 0) AS open_bought
    FROM transactions t
    WHERE t.type = 'buy' AND t.status = 'confirmed' AND t.side IN ('yes', 'no')
      AND t.market_id IS NOT NULL
      AND (_cutoff IS NULL OR t.created_at >= _cutoff)
      AND EXISTS (
        SELECT 1 FROM positions p
        JOIN markets m ON m.id = p.market_id
        WHERE p.user_id = t.user_id
          AND p.market_id = t.market_id
          AND p.shares > 0
          AND m.status = 'active'
      )
    GROUP BY t.user_id
  ),
  -- Unrealized P&L from open active positions
  unrealized AS (
    SELECT
      p.user_id,
      COALESCE(SUM(
        p.shares * (
          COALESCE(mo.price, CASE WHEN p.side = 'yes' THEN m.yes_price WHEN p.side = 'no' THEN m.no_price ELSE p.avg_price END)
          - p.avg_price
        )
      ), 0) AS unrealized_pnl
    FROM positions p
    JOIN markets m ON m.id = p.market_id
    LEFT JOIN market_options mo ON mo.id = p.option_id
    WHERE p.shares > 0 AND m.status = 'active'
    GROUP BY p.user_id
  )
  SELECT
    ut.user_id,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.avatar_url,
    COALESCE(p.verification_level, 'none') AS verification_level,
    -- PnL = payouts + refunds + sells - resolved_buys + unrealized
    -- resolved_buys = total_buys - open_bought
    ut.payouts + ut.refunds + ut.sells
      - (ut.total_buys - COALESCE(ob.open_bought, 0))
      + COALESCE(ur.unrealized_pnl, 0)
    AS pnl,
    ut.total_buys AS volume,
    ut.trade_count AS trades
  FROM user_txns ut
  LEFT JOIN profiles p ON p.id = ut.user_id
  LEFT JOIN open_buy_cost ob ON ob.user_id = ut.user_id
  LEFT JOIN unrealized ur ON ur.user_id = ut.user_id
  ORDER BY
    CASE WHEN _sort = 'pnl' THEN
      ut.payouts + ut.refunds + ut.sells - (ut.total_buys - COALESCE(ob.open_bought, 0)) + COALESCE(ur.unrealized_pnl, 0)
    WHEN _sort = 'volume' THEN ut.total_buys
    WHEN _sort = 'trades' THEN ut.trade_count::numeric
    ELSE
      ut.payouts + ut.refunds + ut.sells - (ut.total_buys - COALESCE(ob.open_bought, 0)) + COALESCE(ur.unrealized_pnl, 0)
    END DESC
  LIMIT _limit;
$function$;