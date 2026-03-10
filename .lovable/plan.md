

## Boost Verified Users in Follow Suggestions

### Problem
The "For You" suggestions tab treats all users equally. Verified (Blue/Gold) users should appear more prominently to encourage following high-value accounts.

### Approach
Move the suggestion logic to a database function that weights users by verification level, using multipliers from `commission_settings` (reusing the existing `blue_trending_multiplier` and `gold_trending_multiplier` fields, e.g. 1.2x and 1.5x).

### Changes

**1. New database function: `get_follow_suggestions`**
- Accepts `_user_id uuid` and `_limit int`
- Queries recent active traders from `transactions` (type=buy, confirmed, last 30 days)
- Excludes the user themselves and anyone they already follow
- Joins `profiles` (only `is_public = true`)
- Assigns a weight: `1.0` for none, `blue_trending_multiplier` for blue, `gold_trending_multiplier` for gold (fetched from `commission_settings`)
- Uses `ORDER BY weight DESC, random()` so verified users float to the top but there's still variety
- Returns profile columns needed by the UI
- `SECURITY DEFINER` + `STABLE`

**2. Update `SocialSection.tsx` suggestions query**
- Replace the current multi-step client-side logic with a single `supabase.rpc("get_follow_suggestions", { _user_id: userId, _limit: 15 })` call
- Map results directly to the existing `renderUserRow` format

### Technical Detail

```sql
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
```

This keeps the existing multiplier settings (already editable from admin panel) and ensures Gold users appear first, then Blue, then unverified — with randomization within each tier for variety.

