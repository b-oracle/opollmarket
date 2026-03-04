
CREATE OR REPLACE FUNCTION public.get_trending_scores()
RETURNS TABLE(
  market_id uuid,
  volume_score numeric,
  participant_score numeric,
  recent_bets_score numeric,
  comments_score numeric,
  likes_score numeric,
  total_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cutoff_48h timestamptz := now() - interval '48 hours';
BEGIN
  RETURN QUERY
  SELECT
    m.id AS market_id,
    ROUND(LEAST(m.volume / NULLIF((SELECT MAX(volume) FROM markets WHERE status = 'active'), 0), 1.0) * 40, 1) AS volume_score,
    ROUND(LEAST(m.participants / NULLIF((SELECT MAX(participants) FROM markets WHERE status = 'active'), 0)::numeric, 1.0) * 20, 1) AS participant_score,
    ROUND(LEAST(COALESCE((SELECT COUNT(*)::numeric FROM transactions t WHERE t.market_id = m.id AND t.type = 'bet' AND t.created_at >= cutoff_48h), 0) / 20.0, 1.0) * 20, 1) AS recent_bets_score,
    ROUND(LEAST(COALESCE((SELECT COUNT(*)::numeric FROM comments c WHERE c.market_id = m.id::text AND c.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10, 1) AS comments_score,
    ROUND(LEAST(COALESCE((SELECT COUNT(*)::numeric FROM market_likes ml WHERE ml.market_id = m.id AND ml.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10, 1) AS likes_score,
    ROUND(
      LEAST(m.volume / NULLIF((SELECT MAX(volume) FROM markets WHERE status = 'active'), 0), 1.0) * 40 +
      LEAST(m.participants / NULLIF((SELECT MAX(participants) FROM markets WHERE status = 'active'), 0)::numeric, 1.0) * 20 +
      LEAST(COALESCE((SELECT COUNT(*)::numeric FROM transactions t WHERE t.market_id = m.id AND t.type = 'bet' AND t.created_at >= cutoff_48h), 0) / 20.0, 1.0) * 20 +
      LEAST(COALESCE((SELECT COUNT(*)::numeric FROM comments c WHERE c.market_id = m.id::text AND c.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10 +
      LEAST(COALESCE((SELECT COUNT(*)::numeric FROM market_likes ml WHERE ml.market_id = m.id AND ml.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10
    , 1) AS total_score
  FROM markets m
  WHERE m.status = 'active'
  ORDER BY total_score DESC;
END;
$$;
