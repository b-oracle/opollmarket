
CREATE OR REPLACE FUNCTION public.get_quick_trade_leaderboard(_limit integer DEFAULT 10)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, total_won numeric, total_wagered numeric, profit numeric, wins bigint, total_bets bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    qb.user_id,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.avatar_url,
    COALESCE(SUM(CASE WHEN qb.status = 'won' THEN qb.payout ELSE 0 END), 0) AS total_won,
    COALESCE(SUM(qb.amount), 0) AS total_wagered,
    COALESCE(SUM(CASE WHEN qb.status = 'won' THEN qb.payout - qb.amount WHEN qb.status = 'lost' THEN -qb.amount ELSE 0 END), 0) AS profit,
    COUNT(*) FILTER (WHERE qb.status = 'won') AS wins,
    COUNT(*) AS total_bets
  FROM quick_bets qb
  LEFT JOIN profiles p ON p.id = qb.user_id
  WHERE qb.status IN ('won', 'lost')
  GROUP BY qb.user_id, p.display_name, p.avatar_url
  HAVING COUNT(*) FILTER (WHERE qb.status = 'won') > 0
  ORDER BY profit DESC
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.get_quick_trade_leaderboard(_limit integer DEFAULT 10, _cutoff timestamptz DEFAULT NULL)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, total_won numeric, total_wagered numeric, profit numeric, wins bigint, total_bets bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    qb.user_id,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.avatar_url,
    COALESCE(SUM(CASE WHEN qb.status = 'won' THEN qb.payout ELSE 0 END), 0) AS total_won,
    COALESCE(SUM(qb.amount), 0) AS total_wagered,
    COALESCE(SUM(CASE WHEN qb.status = 'won' THEN qb.payout - qb.amount WHEN qb.status = 'lost' THEN -qb.amount ELSE 0 END), 0) AS profit,
    COUNT(*) FILTER (WHERE qb.status = 'won') AS wins,
    COUNT(*) AS total_bets
  FROM quick_bets qb
  LEFT JOIN profiles p ON p.id = qb.user_id
  WHERE qb.status IN ('won', 'lost')
    AND (_cutoff IS NULL OR qb.created_at >= _cutoff)
  GROUP BY qb.user_id, p.display_name, p.avatar_url
  HAVING COUNT(*) FILTER (WHERE qb.status = 'won') > 0
  ORDER BY profit DESC
  LIMIT _limit;
$$;
