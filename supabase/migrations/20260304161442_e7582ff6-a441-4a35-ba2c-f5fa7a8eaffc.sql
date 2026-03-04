
CREATE OR REPLACE FUNCTION public.update_trending_markets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cutoff_48h timestamptz := now() - interval '48 hours';
  cutoff_24h timestamptz := now() - interval '24 hours';
BEGIN
  -- Calculate trending score and update top markets
  WITH market_scores AS (
    SELECT
      m.id,
      -- Volume score (normalized, max ~40 points)
      LEAST(m.volume / NULLIF((SELECT MAX(volume) FROM markets WHERE status = 'active'), 0), 1.0) * 40 AS volume_score,
      -- Participant score (max ~20 points)
      LEAST(m.participants / NULLIF((SELECT MAX(participants) FROM markets WHERE status = 'active'), 0), 1.0) * 20 AS participant_score,
      -- Recent bets in last 48h (max ~20 points)
      LEAST(
        COALESCE((
          SELECT COUNT(*)::numeric FROM transactions t
          WHERE t.market_id = m.id
            AND t.type = 'bet'
            AND t.created_at >= cutoff_48h
        ), 0) / 20.0,
        1.0
      ) * 20 AS recent_bets_score,
      -- Comment count (max ~10 points)
      LEAST(
        COALESCE((
          SELECT COUNT(*)::numeric FROM comments c
          WHERE c.market_id = m.id::text
            AND c.created_at >= cutoff_48h
        ), 0) / 10.0,
        1.0
      ) * 10 AS comments_score,
      -- Likes count (max ~10 points)
      LEAST(
        COALESCE((
          SELECT COUNT(*)::numeric FROM market_likes ml
          WHERE ml.market_id = m.id
            AND ml.created_at >= cutoff_48h
        ), 0) / 10.0,
        1.0
      ) * 10 AS likes_score
    FROM markets m
    WHERE m.status = 'active'
  ),
  ranked AS (
    SELECT
      id,
      (volume_score + participant_score + recent_bets_score + comments_score + likes_score) AS total_score,
      ROW_NUMBER() OVER (ORDER BY (volume_score + participant_score + recent_bets_score + comments_score + likes_score) DESC) AS rank
    FROM market_scores
  )
  UPDATE markets
  SET trending = (ranked.rank <= 10 AND ranked.total_score > 5)
  FROM ranked
  WHERE markets.id = ranked.id;
END;
$$;
