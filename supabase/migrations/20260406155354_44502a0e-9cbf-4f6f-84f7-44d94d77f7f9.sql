
-- 1. Atomic withdrawal claim RPC to prevent double-approve race condition
CREATE OR REPLACE FUNCTION public.claim_withdrawal_for_processing(_withdrawal_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _withdrawal record;
BEGIN
  -- Lock the row and verify it's still pending
  SELECT * INTO _withdrawal
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _withdrawal.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already processed (status: ' || _withdrawal.status || ')');
  END IF;

  -- Atomically set status to processing to prevent concurrent claims
  UPDATE public.withdrawal_requests
  SET status = 'processing', updated_at = now()
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _withdrawal.user_id,
    'amount', _withdrawal.amount,
    'wallet_address', _withdrawal.wallet_address,
    'crypto_currency', _withdrawal.crypto_currency
  );
END;
$$;
