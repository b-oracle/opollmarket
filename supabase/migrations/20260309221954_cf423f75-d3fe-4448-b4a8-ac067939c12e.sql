
-- Add revenue share config columns to commission_settings
ALTER TABLE public.commission_settings 
  ADD COLUMN IF NOT EXISTS blue_revenue_share_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_revenue_share_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blue_trending_multiplier numeric NOT NULL DEFAULT 1.2,
  ADD COLUMN IF NOT EXISTS gold_trending_multiplier numeric NOT NULL DEFAULT 1.5;

-- Create revenue_shares table to track accumulated and paid earnings
CREATE TABLE IF NOT EXISTS public.revenue_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  market_id uuid REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  verification_tier text NOT NULL DEFAULT 'blue',
  share_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenue_shares ENABLE ROW LEVEL SECURITY;

-- Users can read own revenue shares
CREATE POLICY "Users can read own revenue shares"
  ON public.revenue_shares FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all revenue shares
CREATE POLICY "Admins can read all revenue shares"
  ON public.revenue_shares FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Update trending function to apply verification multiplier
CREATE OR REPLACE FUNCTION public.update_trending_markets()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_48h timestamptz := now() - interval '48 hours';
  _blue_mult numeric;
  _gold_mult numeric;
BEGIN
  -- Get multipliers from settings
  SELECT COALESCE(blue_trending_multiplier, 1.2), COALESCE(gold_trending_multiplier, 1.5)
  INTO _blue_mult, _gold_mult
  FROM commission_settings LIMIT 1;

  IF _blue_mult IS NULL THEN _blue_mult := 1.2; END IF;
  IF _gold_mult IS NULL THEN _gold_mult := 1.5; END IF;

  WITH market_scores AS (
    SELECT
      m.id,
      m.pinned_trending,
      m.creator_wallet,
      LEAST(m.volume / NULLIF((SELECT MAX(volume) FROM markets WHERE status = 'active'), 0), 1.0) * 40 AS volume_score,
      LEAST(m.participants / NULLIF((SELECT MAX(participants) FROM markets WHERE status = 'active'), 0)::numeric, 1.0) * 20 AS participant_score,
      LEAST(COALESCE((SELECT COUNT(*)::numeric FROM transactions t WHERE t.market_id = m.id AND t.type = 'bet' AND t.created_at >= cutoff_48h), 0) / 20.0, 1.0) * 20 AS recent_bets_score,
      LEAST(COALESCE((SELECT COUNT(*)::numeric FROM comments c WHERE c.market_id = m.id::text AND c.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10 AS comments_score,
      LEAST(COALESCE((SELECT COUNT(*)::numeric FROM market_likes ml WHERE ml.market_id = m.id AND ml.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10 AS likes_score
    FROM markets m
    WHERE m.status = 'active'
  ),
  scored AS (
    SELECT
      ms.id,
      ms.pinned_trending,
      (ms.volume_score + ms.participant_score + ms.recent_bets_score + ms.comments_score + ms.likes_score) AS raw_score,
      CASE 
        WHEN p.verification_level = 'gold' THEN _gold_mult
        WHEN p.verification_level = 'blue' THEN _blue_mult
        ELSE 1.0
      END AS multiplier
    FROM market_scores ms
    LEFT JOIN profiles p ON p.id::text = ms.creator_wallet
  ),
  ranked AS (
    SELECT
      id,
      pinned_trending,
      raw_score * multiplier AS total_score,
      ROW_NUMBER() OVER (ORDER BY raw_score * multiplier DESC) AS rank
    FROM scored
  )
  UPDATE markets
  SET trending = (ranked.pinned_trending OR (ranked.rank <= 10 AND ranked.total_score > 5))
  FROM ranked
  WHERE markets.id = ranked.id;
END;
$function$;

-- Also update get_trending_scores to show boosted scores
CREATE OR REPLACE FUNCTION public.get_trending_scores()
 RETURNS TABLE(market_id uuid, volume_score numeric, participant_score numeric, recent_bets_score numeric, comments_score numeric, likes_score numeric, total_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_48h timestamptz := now() - interval '48 hours';
  _blue_mult numeric;
  _gold_mult numeric;
BEGIN
  SELECT COALESCE(blue_trending_multiplier, 1.2), COALESCE(gold_trending_multiplier, 1.5)
  INTO _blue_mult, _gold_mult
  FROM commission_settings LIMIT 1;

  IF _blue_mult IS NULL THEN _blue_mult := 1.2; END IF;
  IF _gold_mult IS NULL THEN _gold_mult := 1.5; END IF;

  RETURN QUERY
  SELECT
    m.id AS market_id,
    ROUND(LEAST(m.volume / NULLIF((SELECT MAX(volume) FROM markets WHERE status = 'active'), 0), 1.0) * 40, 1) AS volume_score,
    ROUND(LEAST(m.participants / NULLIF((SELECT MAX(participants) FROM markets WHERE status = 'active'), 0)::numeric, 1.0) * 20, 1) AS participant_score,
    ROUND(LEAST(COALESCE((SELECT COUNT(*)::numeric FROM transactions t WHERE t.market_id = m.id AND t.type = 'bet' AND t.created_at >= cutoff_48h), 0) / 20.0, 1.0) * 20, 1) AS recent_bets_score,
    ROUND(LEAST(COALESCE((SELECT COUNT(*)::numeric FROM comments c WHERE c.market_id = m.id::text AND c.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10, 1) AS comments_score,
    ROUND(LEAST(COALESCE((SELECT COUNT(*)::numeric FROM market_likes ml WHERE ml.market_id = m.id AND ml.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10, 1) AS likes_score,
    ROUND(
      (
        LEAST(m.volume / NULLIF((SELECT MAX(volume) FROM markets WHERE status = 'active'), 0), 1.0) * 40 +
        LEAST(m.participants / NULLIF((SELECT MAX(participants) FROM markets WHERE status = 'active'), 0)::numeric, 1.0) * 20 +
        LEAST(COALESCE((SELECT COUNT(*)::numeric FROM transactions t WHERE t.market_id = m.id AND t.type = 'bet' AND t.created_at >= cutoff_48h), 0) / 20.0, 1.0) * 20 +
        LEAST(COALESCE((SELECT COUNT(*)::numeric FROM comments c WHERE c.market_id = m.id::text AND c.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10 +
        LEAST(COALESCE((SELECT COUNT(*)::numeric FROM market_likes ml WHERE ml.market_id = m.id AND ml.created_at >= cutoff_48h), 0) / 10.0, 1.0) * 10
      ) * CASE 
        WHEN p.verification_level = 'gold' THEN _gold_mult
        WHEN p.verification_level = 'blue' THEN _blue_mult
        ELSE 1.0
      END
    , 1) AS total_score
  FROM markets m
  LEFT JOIN profiles p ON p.id::text = m.creator_wallet
  WHERE m.status = 'active'
  ORDER BY total_score DESC;
END;
$function$;
