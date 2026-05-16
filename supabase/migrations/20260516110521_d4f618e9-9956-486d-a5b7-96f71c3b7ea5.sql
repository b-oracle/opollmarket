-- Track automated re-verification of manual_review BSC deposits
ALTER TABLE public.bsc_deposit_events
  ADD COLUMN IF NOT EXISTS last_reverified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reverify_status TEXT,
  ADD COLUMN IF NOT EXISTS last_reverify_details JSONB,
  ADD COLUMN IF NOT EXISTS reverify_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bsc_events_manual_review
  ON public.bsc_deposit_events (status, last_reverified_at NULLS FIRST)
  WHERE status = 'manual_review';

-- Auto-reject (used by the reverify job when on-chain receipt no longer matches)
CREATE OR REPLACE FUNCTION public.system_reject_bsc_deposit(
  _event_id UUID,
  _reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bsc_deposit_events
     SET status = 'rejected',
         review_reason = _reason,
         reviewed_at = NOW(),
         reviewed_by = NULL  -- NULL actor = system
   WHERE id = _event_id
     AND status = 'manual_review';
END;
$$;

REVOKE ALL ON FUNCTION public.system_reject_bsc_deposit(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_reject_bsc_deposit(UUID, TEXT) TO service_role;