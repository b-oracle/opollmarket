-- Backfill option_id on positions from their buy transactions
UPDATE positions p
SET option_id = sub.option_id
FROM (
  SELECT DISTINCT ON (t.user_id, t.market_id)
    t.user_id, t.market_id, t.option_id
  FROM transactions t
  JOIN markets m ON m.id = t.market_id
  WHERE t.option_id IS NOT NULL
    AND t.type = 'buy'
    AND m.market_type IN ('multi', 'range')
  ORDER BY t.user_id, t.market_id, t.created_at DESC
) sub
WHERE p.user_id = sub.user_id
  AND p.market_id = sub.market_id
  AND p.option_id IS NULL
  AND p.shares > 0