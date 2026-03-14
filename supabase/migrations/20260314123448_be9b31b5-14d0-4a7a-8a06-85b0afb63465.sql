
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS simulated_volume numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simulated_participants integer NOT NULL DEFAULT 0;

-- Backfill: move fake stats from unverified admin-created markets into simulated columns
-- For unverified markets with liquidity, the volume/participants were simulated
UPDATE public.markets
SET simulated_volume = volume,
    simulated_participants = participants,
    volume = 0,
    participants = 0
WHERE liquidity_verified = false
  AND initial_liquidity > 0
  AND (volume > 0 OR participants > 0);
