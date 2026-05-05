
-- Add columns to track partial deposit top-up flow
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS topup_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shortfall_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS received_amount_usd NUMERIC;

CREATE INDEX IF NOT EXISTS idx_transactions_awaiting_topup
  ON public.transactions (topup_deadline)
  WHERE status = 'awaiting_topup';

-- Update claim function to also pick up awaiting_topup rows so subsequent
-- top-up webhooks (same payment_id) can re-evaluate and credit
CREATE OR REPLACE FUNCTION public.claim_webhook_deposit(_payment_id text, _provider text)
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
    AND t.status IN ('pending', 'expired', 'awaiting_topup')
  RETURNING t.id, t.user_id, t.amount, t.status;
END;
$function$;

-- Cron-callable function: expire awaiting_topup deposits past deadline
-- and route them to admin review (status = 'admin_review').
CREATE OR REPLACE FUNCTION public.expire_awaiting_topup_deposits()
RETURNS TABLE(transaction_id uuid, user_id uuid, payment_id text, requested numeric, received numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    UPDATE public.transactions t
    SET status = 'admin_review'
    WHERE t.type = 'deposit'
      AND t.status = 'awaiting_topup'
      AND t.topup_deadline IS NOT NULL
      AND t.topup_deadline < now()
    RETURNING t.id, t.user_id, t.nowpayments_payment_id, t.amount, t.received_amount_usd
  LOOP
    -- Notify user
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      r.user_id,
      'Deposit Under Review ⚠️',
      format('Your deposit of $%s did not receive the required top-up within 1 hour. We received $%s and our team will review your case shortly.',
             to_char(coalesce(r.amount,0), 'FM999990.00'),
             to_char(coalesce(r.received_amount_usd,0), 'FM999990.00')),
      'deposit'
    );

    -- Notify admins
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT ur.user_id,
           '🚨 Partial Deposit Awaiting Review',
           format('User %s payment %s expired without top-up. Requested $%s, received $%s. Manual review required.',
                  substring(r.user_id::text, 1, 8),
                  coalesce(r.nowpayments_payment_id,'(none)'),
                  to_char(coalesce(r.amount,0), 'FM999990.00'),
                  to_char(coalesce(r.received_amount_usd,0), 'FM999990.00')),
           'info'
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'super_admin');

    transaction_id := r.id;
    user_id := r.user_id;
    payment_id := r.nowpayments_payment_id;
    requested := r.amount;
    received := r.received_amount_usd;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- Schedule expiry cron every 5 minutes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-awaiting-topup-deposits') THEN
    PERFORM cron.schedule(
      'expire-awaiting-topup-deposits',
      '*/5 * * * *',
      $cron$ SELECT public.expire_awaiting_topup_deposits(); $cron$
    );
  END IF;
END $$;
