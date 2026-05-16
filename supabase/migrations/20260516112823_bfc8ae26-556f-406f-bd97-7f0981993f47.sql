ALTER TABLE public.bsc_deposit_events
  ADD COLUMN IF NOT EXISTS rpc_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tx_missing_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tx_failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_reverify_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bsc_deposit_events_manual_review_next
  ON public.bsc_deposit_events (next_reverify_at NULLS FIRST, last_reverified_at NULLS FIRST)
  WHERE status = 'manual_review';