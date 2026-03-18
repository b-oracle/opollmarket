
-- Table for creation fee escrows
CREATE TABLE public.creation_fee_escrows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'held',
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

ALTER TABLE public.creation_fee_escrows ENABLE ROW LEVEL SECURITY;

-- Users can read their own escrows
CREATE POLICY "Users can read own escrows"
  ON public.creation_fee_escrows
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RPC: Atomically hold creation fee in escrow
CREATE OR REPLACE FUNCTION public.hold_creation_fee_escrow(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _cur_amount numeric;
  _escrow_id uuid;
BEGIN
  -- Check for existing held escrow
  IF EXISTS (SELECT 1 FROM creation_fee_escrows WHERE user_id = _user_id AND status = 'held') THEN
    -- Return existing escrow id
    SELECT id INTO _escrow_id FROM creation_fee_escrows WHERE user_id = _user_id AND status = 'held' LIMIT 1;
    RETURN jsonb_build_object('success', true, 'escrow_id', _escrow_id, 'already_held', true);
  END IF;

  -- Lock and check balance
  SELECT amount INTO _cur_amount
  FROM balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_amount < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Deduct balance
  UPDATE balances
  SET amount = amount - _amount, updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  -- Create escrow record
  INSERT INTO creation_fee_escrows (user_id, amount, status)
  VALUES (_user_id, _amount, 'held')
  RETURNING id INTO _escrow_id;

  RETURN jsonb_build_object('success', true, 'escrow_id', _escrow_id);
END;
$$;

-- RPC: Release creation fee escrow (used or refunded)
CREATE OR REPLACE FUNCTION public.release_creation_fee_escrow(_escrow_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _escrow record;
BEGIN
  SELECT * INTO _escrow
  FROM creation_fee_escrows
  WHERE id = _escrow_id AND status = 'held'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow not found or already released');
  END IF;

  IF _action = 'refunded' THEN
    -- Credit balance back
    UPDATE balances
    SET amount = amount + _escrow.amount, updated_at = now()
    WHERE user_id = _escrow.user_id AND currency = 'USDT';
  ELSIF _action = 'used' THEN
    -- Credit to platform pool
    UPDATE platform_pool
    SET balance = balance + _escrow.amount, updated_at = now()
    WHERE id = (SELECT id FROM platform_pool LIMIT 1);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  UPDATE creation_fee_escrows
  SET status = _action, released_at = now()
  WHERE id = _escrow_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
