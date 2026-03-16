
-- 1. Add oSURE columns to commission_settings
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS osure_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS osure_25_premium numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS osure_50_premium numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS osure_100_premium numeric NOT NULL DEFAULT 30;

-- 2. Add insurance_balance to balances
ALTER TABLE public.balances
  ADD COLUMN IF NOT EXISTS insurance_balance numeric NOT NULL DEFAULT 0;

-- 3. Add insurance columns to positions
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS insurance_tier numeric,
  ADD COLUMN IF NOT EXISTS insurance_premium numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_claimed boolean NOT NULL DEFAULT false;

-- 4. Create insurance_claims table
CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  tier numeric NOT NULL,
  premium_paid numeric NOT NULL DEFAULT 0,
  claim_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  claimed_at timestamp with time zone
);

ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;

-- RLS: users read own
CREATE POLICY "Users can read own insurance claims"
  ON public.insurance_claims FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS: admins read all
CREATE POLICY "Admins can read all insurance claims"
  ON public.insurance_claims FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Update adjust_balance to support insurance_balance
CREATE OR REPLACE FUNCTION public.adjust_balance(_user_id uuid, _delta numeric, _bonus_delta numeric DEFAULT 0, _insurance_delta numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.balances
  SET amount = GREATEST(0, amount + _delta),
      bonus_balance = GREATEST(0, bonus_balance + _bonus_delta),
      insurance_balance = GREATEST(0, insurance_balance + _insurance_delta),
      updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  IF NOT FOUND THEN
    INSERT INTO public.balances (user_id, amount, bonus_balance, insurance_balance, currency)
    VALUES (_user_id, GREATEST(0, _delta), GREATEST(0, _bonus_delta), GREATEST(0, _insurance_delta), 'USDT');
  END IF;
END;
$$;
