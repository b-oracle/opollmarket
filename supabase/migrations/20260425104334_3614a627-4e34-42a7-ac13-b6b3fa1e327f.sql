-- Webhook processing logs for admin debugging of stuck deposits
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,                 -- 'payaza' | 'nowpayments' | 'flutterwave'
  event_type text NOT NULL,               -- e.g. 'received', 'claimed', 'credited', 'wrong_asset', 'partial', 'overpayment', 'failed', 'error', 'duplicate'
  status text NOT NULL DEFAULT 'info',    -- 'info' | 'success' | 'warning' | 'error'
  reference text,                         -- payment_id / tx_ref / merchant reference
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  user_id uuid,
  requested_amount numeric,
  credited_amount numeric,
  bonus_amount numeric,
  message text,
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON public.webhook_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_reference ON public.webhook_logs (reference);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_transaction_id ON public.webhook_logs (transaction_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_user_id ON public.webhook_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON public.webhook_logs (status);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only admins/super_admins can read; edge functions use service role and bypass RLS
CREATE POLICY "Admins can view webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- No client inserts/updates/deletes (only service role)
CREATE POLICY "No client writes to webhook logs"
ON public.webhook_logs
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);