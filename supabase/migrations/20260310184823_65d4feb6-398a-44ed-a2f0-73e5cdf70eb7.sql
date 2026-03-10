CREATE OR REPLACE FUNCTION public.get_follow_suggestions(_user_id uuid, _limit int DEFAULT 15)
RETURNS TABLE(id uuid, display_name text, avatar_url text, bio text, verification_level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH multipliers AS (
    SELECT COALESCE(blue_trending_multiplier, 1.2) AS blue_m,
           COALESCE(gold_trending_multiplier, 1.5) AS gold_m
    FROM commission_settings LIMIT 1
  ),
  active_traders AS (
    SELECT DISTINCT t.user_id
    FROM transactions t
    WHERE t.type = 'buy' AND t.status = 'confirmed'
      AND t.created_at >= now() - interval '30 days'
      AND t.user_id != _user_id
      AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = _user_id AND f.following_id = t.user_id)
  )
  SELECT p.id, p.display_name, p.avatar_url, p.bio, p.verification_level
  FROM active_traders at
  JOIN profiles p ON p.id = at.user_id AND p.is_public = true
  CROSS JOIN multipliers m
  ORDER BY
    CASE p.verification_level
      WHEN 'gold' THEN m.gold_m
      WHEN 'blue' THEN m.blue_m
      ELSE 1.0
    END DESC,
    random()
  LIMIT _limit;
$$;