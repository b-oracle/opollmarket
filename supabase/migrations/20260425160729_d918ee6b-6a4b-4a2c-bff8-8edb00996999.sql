-- Add stack trace column for webhook failures
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS stack text;

-- Composite index to speed up the failures dashboard query
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status_provider_created
  ON public.webhook_logs (status, provider, created_at DESC)
  WHERE status IN ('error', 'warning');