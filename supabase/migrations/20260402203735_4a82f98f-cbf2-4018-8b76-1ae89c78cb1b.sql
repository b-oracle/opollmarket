
-- Add gift_balance and rewards_balance columns to balances table
ALTER TABLE public.balances ADD COLUMN IF NOT EXISTS gift_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.balances ADD COLUMN IF NOT EXISTS rewards_balance numeric NOT NULL DEFAULT 0;

-- Create space_gifts table
CREATE TABLE public.space_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  space_id uuid NOT NULL,
  emoji text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.space_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own gifts" ON public.space_gifts FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Admins can read all gifts" ON public.space_gifts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RPC: send_space_gift - atomic gift transaction
CREATE OR REPLACE FUNCTION public.send_space_gift(
  _sender_id uuid,
  _recipient_id uuid,
  _space_id uuid,
  _emoji text,
  _amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cur_gift numeric;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  IF _sender_id = _recipient_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot gift yourself');
  END IF;

  -- Lock sender balance
  SELECT gift_balance INTO _cur_gift
  FROM public.balances
  WHERE user_id = _sender_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_gift < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient gift balance');
  END IF;

  -- Deduct from sender gift_balance
  UPDATE public.balances
  SET gift_balance = gift_balance - _amount, updated_at = now()
  WHERE user_id = _sender_id AND currency = 'USDT';

  -- Credit recipient rewards_balance
  UPDATE public.balances
  SET rewards_balance = rewards_balance + _amount, updated_at = now()
  WHERE user_id = _recipient_id AND currency = 'USDT';

  -- If recipient has no balance row, create one
  IF NOT FOUND THEN
    INSERT INTO public.balances (user_id, amount, rewards_balance, currency)
    VALUES (_recipient_id, 0, _amount, 'USDT');
  END IF;

  -- Log gift
  INSERT INTO public.space_gifts (sender_id, recipient_id, space_id, emoji, amount)
  VALUES (_sender_id, _recipient_id, _space_id, _emoji, _amount);

  RETURN jsonb_build_object('success', true, 'remaining_gift_balance', _cur_gift - _amount);
END;
$$;

-- RPC: topup_gift_balance - transfer from main to gift balance
CREATE OR REPLACE FUNCTION public.topup_gift_balance(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cur_amount numeric;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT amount INTO _cur_amount
  FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_amount < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient main balance');
  END IF;

  UPDATE public.balances
  SET amount = amount - _amount, gift_balance = gift_balance + _amount, updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: withdraw_rewards_balance - transfer rewards to main balance
CREATE OR REPLACE FUNCTION public.withdraw_rewards_balance(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cur_rewards numeric;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT rewards_balance INTO _cur_rewards
  FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_rewards < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient rewards balance');
  END IF;

  UPDATE public.balances
  SET rewards_balance = rewards_balance - _amount, amount = amount + _amount, updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  RETURN jsonb_build_object('success', true);
END;
$$;
