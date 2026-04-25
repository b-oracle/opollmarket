-- ──────────────────────────────────────────────────────────────
-- Wave 1 + 2 + 3: deposit/withdrawal hardening
-- ──────────────────────────────────────────────────────────────

-- 1. Backfill payment_provider for legacy NOWPayments rows
-- (rows with numeric-looking nowpayments_payment_id and null provider)
UPDATE public.transactions
SET payment_provider = 'nowpayments'
WHERE payment_provider IS NULL
  AND nowpayments_payment_id IS NOT NULL
  AND nowpayments_payment_id ~ '^[0-9]+$';

-- Anything else with a non-numeric reference (payaza_, flw_, wd_, etc.)
-- and null provider gets inferred from the reference prefix.
UPDATE public.transactions
SET payment_provider = CASE
  WHEN nowpayments_payment_id LIKE 'payaza\_%' ESCAPE '\' THEN 'payaza'
  WHEN nowpayments_payment_id LIKE 'promo\_%' ESCAPE '\' THEN 'payaza'
  WHEN nowpayments_payment_id LIKE 'flw\_%' ESCAPE '\' THEN 'flutterwave'
  WHEN nowpayments_payment_id LIKE 'wd\_%' ESCAPE '\' THEN 'nowpayments'
  ELSE 'unknown'
END
WHERE payment_provider IS NULL
  AND nowpayments_payment_id IS NOT NULL;

-- 2. Unique idempotency indices per provider, per type
--    (separate indices for deposits and withdrawals so the same external
--    id couldn't accidentally collide across types either)
CREATE UNIQUE INDEX IF NOT EXISTS transactions_deposit_provider_payment_uniq
  ON public.transactions (payment_provider, nowpayments_payment_id)
  WHERE nowpayments_payment_id IS NOT NULL
    AND type = 'deposit';

CREATE UNIQUE INDEX IF NOT EXISTS transactions_withdrawal_provider_payment_uniq
  ON public.transactions (payment_provider, nowpayments_payment_id)
  WHERE nowpayments_payment_id IS NOT NULL
    AND type = 'withdrawal';

-- 3. Link transactions to withdrawal_requests for safe approve/reject
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS withdrawal_request_id uuid
    REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_withdrawal_request_id
  ON public.transactions (withdrawal_request_id)
  WHERE withdrawal_request_id IS NOT NULL;

-- 4. Update claim_webhook_deposit to REQUIRE provider (no more nullable
--    provider — all webhook handlers must pass it explicitly)
DROP FUNCTION IF EXISTS public.claim_webhook_deposit(text, text);
DROP FUNCTION IF EXISTS public.claim_webhook_deposit(text);

CREATE OR REPLACE FUNCTION public.claim_webhook_deposit(
  _payment_id text,
  _provider text
)
RETURNS TABLE(id uuid, user_id uuid, amount numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _provider IS NULL OR length(trim(_provider)) = 0 THEN
    RAISE EXCEPTION 'claim_webhook_deposit: provider is required';
  END IF;

  RETURN QUERY
  UPDATE public.transactions t
  SET status = 'processing'
  WHERE t.nowpayments_payment_id = _payment_id
    AND t.payment_provider = _provider
    AND t.type = 'deposit'
    AND t.status IN ('pending', 'expired')
  RETURNING t.id, t.user_id, t.amount, t.status;
END;
$function$;

-- 5. Drop the legacy 3-arg adjust_balance overload (now unused)
DROP FUNCTION IF EXISTS public.adjust_balance(uuid, numeric, numeric);

-- 6. Add admin-tunable withdrawal anomaly threshold
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS withdrawal_anomaly_threshold numeric
    NOT NULL DEFAULT 1000;