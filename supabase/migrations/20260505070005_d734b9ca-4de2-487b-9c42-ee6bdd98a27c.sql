-- Resolution guardrails: prevent YES/NO resolution after abnormal termination conditions
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS resolution_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_block_reason text,
  ADD COLUMN IF NOT EXISTS resolution_blocked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_markets_resolution_blocked
  ON public.markets (resolution_blocked)
  WHERE resolution_blocked = true;

COMMENT ON COLUMN public.markets.resolution_blocked IS
  'Set true when an abnormal termination is detected (premature close, missing source data, failed metric refresh). Blocks YES/NO resolution; market must be reviewed/voided by an admin.';