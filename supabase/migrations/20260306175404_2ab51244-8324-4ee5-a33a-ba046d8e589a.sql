CREATE OR REPLACE FUNCTION public.get_streak_leaderboard(_limit integer DEFAULT 20)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  current_streak integer,
  best_streak integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.user_id,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.avatar_url,
    s.current_streak,
    s.best_streak
  FROM quick_trade_streaks s
  LEFT JOIN profiles p ON p.id = s.user_id
  WHERE s.current_streak > 0
  ORDER BY s.current_streak DESC, s.best_streak DESC
  LIMIT _limit;
$$;