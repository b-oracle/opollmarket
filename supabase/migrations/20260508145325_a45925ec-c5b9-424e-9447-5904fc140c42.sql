-- Safeguard against duplicate crypto round spawns per deadline
ALTER TABLE public.crypto_round_meta
  ADD COLUMN IF NOT EXISTS predecessor_end_time timestamptz NOT NULL DEFAULT 'epoch'::timestamptz;

-- Backfill predecessor_end_time for existing rows so the index can be created
-- Each row's predecessor is the most recent earlier round's end_time for the same pair
UPDATE public.crypto_round_meta m
SET predecessor_end_time = COALESCE((
  SELECT p.end_time
  FROM public.crypto_round_meta p
  WHERE p.asset = m.asset
    AND p.duration_minutes = m.duration_minutes
    AND p.start_time < m.start_time
  ORDER BY p.end_time DESC
  LIMIT 1
), 'epoch'::timestamptz)
WHERE m.predecessor_end_time = 'epoch'::timestamptz;

-- Enforce: at most one new round per (asset, duration, predecessor deadline)
CREATE UNIQUE INDEX IF NOT EXISTS crypto_round_meta_predecessor_unique
  ON public.crypto_round_meta (asset, duration_minutes, predecessor_end_time);