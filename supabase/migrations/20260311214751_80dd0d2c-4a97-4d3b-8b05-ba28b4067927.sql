
-- Debt ledger: tracks outstanding amounts owed by users
CREATE TABLE public.balance_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  reason text NOT NULL DEFAULT 'market_liquidity',
  market_id uuid REFERENCES public.markets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  settled_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
);

ALTER TABLE public.balance_debts ENABLE ROW LEVEL SECURITY;

-- Users can see own debts
CREATE POLICY "Users can read own debts" ON public.balance_debts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admins can read all debts  
CREATE POLICY "Admins can read all debts" ON public.balance_debts
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Create a function to settle debts on deposit
CREATE OR REPLACE FUNCTION public.settle_user_debts(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _debt record;
  _balance numeric;
  _total_settled numeric := 0;
  _debts_settled int := 0;
BEGIN
  -- Get current balance
  SELECT amount INTO _balance
  FROM public.balances
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND OR _balance <= 0 THEN
    RETURN jsonb_build_object('settled', 0, 'amount', 0);
  END IF;

  -- Settle debts oldest first
  FOR _debt IN
    SELECT id, amount - settled_amount AS remaining
    FROM public.balance_debts
    WHERE user_id = _user_id AND status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN _balance <= 0;

    IF _balance >= _debt.remaining THEN
      -- Full settlement
      UPDATE public.balance_debts
      SET settled_amount = amount, status = 'settled', settled_at = now()
      WHERE id = _debt.id;
      _balance := _balance - _debt.remaining;
      _total_settled := _total_settled + _debt.remaining;
    ELSE
      -- Partial settlement
      UPDATE public.balance_debts
      SET settled_amount = settled_amount + _balance
      WHERE id = _debt.id;
      _total_settled := _total_settled + _balance;
      _balance := 0;
    END IF;
    _debts_settled := _debts_settled + 1;
  END LOOP;

  IF _total_settled > 0 THEN
    UPDATE public.balances
    SET amount = amount - _total_settled, updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  RETURN jsonb_build_object('settled', _debts_settled, 'amount', _total_settled);
END;
$$;

-- Update deduct_market_liquidity to log debt if balance insufficient
CREATE OR REPLACE FUNCTION public.deduct_market_liquidity(
  _user_id uuid,
  _liquidity_amount numeric,
  _fee_amount numeric DEFAULT 0,
  _bonus_for_fee numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _balance record;
  _main_deduction numeric;
  _actual_deduction numeric;
  _debt_amount numeric;
BEGIN
  _main_deduction := _liquidity_amount + (_fee_amount - _bonus_for_fee);

  SELECT amount, bonus_balance INTO _balance
  FROM public.balances
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance record not found');
  END IF;

  IF _bonus_for_fee > 0 AND _balance.bonus_balance < _bonus_for_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bonus balance');
  END IF;

  IF _balance.amount >= _main_deduction THEN
    -- Full deduction
    UPDATE public.balances
    SET amount = amount - _main_deduction,
        bonus_balance = bonus_balance - _bonus_for_fee,
        updated_at = now()
    WHERE user_id = _user_id;

    RETURN jsonb_build_object('success', true, 'deducted_main', _main_deduction, 'deducted_bonus', _bonus_for_fee, 'debt', 0);
  ELSE
    -- Partial deduction: take what's available, log the rest as debt
    _actual_deduction := _balance.amount;
    _debt_amount := _main_deduction - _actual_deduction;

    UPDATE public.balances
    SET amount = 0,
        bonus_balance = bonus_balance - _bonus_for_fee,
        updated_at = now()
    WHERE user_id = _user_id;

    -- Log the outstanding debt
    INSERT INTO public.balance_debts (user_id, amount, reason)
    VALUES (_user_id, _debt_amount, 'market_liquidity');

    RETURN jsonb_build_object('success', true, 'deducted_main', _actual_deduction, 'deducted_bonus', _bonus_for_fee, 'debt', _debt_amount);
  END IF;
END;
$$;
