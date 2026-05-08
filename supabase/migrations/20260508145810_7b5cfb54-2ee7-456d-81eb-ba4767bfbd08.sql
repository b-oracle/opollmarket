ALTER TABLE public.crypto_round_meta
  ADD COLUMN IF NOT EXISTS notified_resolving_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_spawned_at timestamptz;