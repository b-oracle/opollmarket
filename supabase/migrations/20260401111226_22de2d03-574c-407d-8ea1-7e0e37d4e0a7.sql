
-- 1. Atomic webhook claim function: prevents double-crediting from concurrent replays
-- Attempts to transition a transaction from pending/expired → processing.
-- Returns the row if successful, NULL if already claimed by another process.
CREATE OR REPLACE FUNCTION public.claim_webhook_deposit(_payment_id text, _provider text DEFAULT NULL)
RETURNS TABLE(id uuid, user_id uuid, amount numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- For NowPayments (no provider field)
  IF _provider IS NULL THEN
    RETURN QUERY
    UPDATE transactions t
    SET status = 'processing'
    WHERE t.nowpayments_payment_id = _payment_id
      AND t.type = 'deposit'
      AND t.status IN ('pending', 'expired')
    RETURNING t.id, t.user_id, t.amount, t.status;
  ELSE
    RETURN QUERY
    UPDATE transactions t
    SET status = 'processing'
    WHERE t.nowpayments_payment_id = _payment_id
      AND t.payment_provider = _provider
      AND t.type = 'deposit'
      AND t.status IN ('pending', 'expired')
    RETURNING t.id, t.user_id, t.amount, t.status;
  END IF;
END;
$$;

-- 2. Email normalization function for anti-Sybil referral checks
-- Strips Gmail dots and +suffixes: "j.o.h.n+test@gmail.com" → "john@gmail.com"
CREATE OR REPLACE FUNCTION public.normalize_email(_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _local text;
  _domain text;
BEGIN
  IF _email IS NULL OR _email = '' THEN RETURN _email; END IF;
  _local := split_part(lower(trim(_email)), '@', 1);
  _domain := split_part(lower(trim(_email)), '@', 2);
  
  -- For Gmail and Googlemail, strip dots and +suffix
  IF _domain IN ('gmail.com', 'googlemail.com') THEN
    -- Remove +suffix first
    _local := split_part(_local, '+', 1);
    -- Remove dots
    _local := replace(_local, '.', '');
    _domain := 'gmail.com'; -- normalize googlemail too
  END IF;
  
  RETURN _local || '@' || _domain;
END;
$$;

-- 3. Update referral reward trigger to check normalized email for Sybil prevention
CREATE OR REPLACE FUNCTION public.handle_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referred_by uuid;
  v_reward_amount numeric;
  v_existing_buys bigint;
  v_user_email text;
  v_normalized_email text;
  v_sybil_count bigint;
BEGIN
  -- Only process confirmed buy transactions
  IF NEW.type != 'buy' OR NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Check if user has any PREVIOUS confirmed buy transactions (this should be their first)
  SELECT count(*) INTO v_existing_buys
  FROM public.transactions
  WHERE user_id = NEW.user_id
    AND type = 'buy'
    AND status = 'confirmed'
    AND id != NEW.id;

  IF v_existing_buys > 0 THEN
    RETURN NEW; -- Not their first bet
  END IF;

  -- Check if user was referred
  SELECT referred_by, email INTO v_referred_by, v_user_email
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_referred_by IS NULL THEN
    RETURN NEW; -- Not referred
  END IF;

  -- Check if reward already given (idempotency)
  IF EXISTS (
    SELECT 1 FROM public.referral_rewards
    WHERE referrer_id = v_referred_by AND referred_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  -- SYBIL CHECK: Has a reward already been given for a normalized-email-equivalent account?
  v_normalized_email := public.normalize_email(v_user_email);
  SELECT count(*) INTO v_sybil_count
  FROM public.referral_rewards rr
  JOIN public.profiles p ON p.id = rr.referred_id
  WHERE rr.referrer_id = v_referred_by
    AND public.normalize_email(p.email) = v_normalized_email;

  IF v_sybil_count > 0 THEN
    RAISE WARNING 'Sybil referral blocked: % (normalized: %) already rewarded referrer %',
      v_user_email, v_normalized_email, v_referred_by;
    RETURN NEW; -- Block the reward
  END IF;

  -- Get reward amount from settings
  SELECT referral_reward_amount INTO v_reward_amount
  FROM public.commission_settings
  LIMIT 1;

  IF v_reward_amount IS NULL OR v_reward_amount <= 0 THEN
    v_reward_amount := 5;
  END IF;

  -- Insert referral reward record
  INSERT INTO public.referral_rewards (referrer_id, referred_id, amount)
  VALUES (v_referred_by, NEW.user_id, v_reward_amount);

  -- Credit referrer's bonus balance
  UPDATE public.balances
  SET bonus_balance = bonus_balance + v_reward_amount,
      updated_at = now()
  WHERE user_id = v_referred_by;

  -- Notify referrer
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_referred_by,
    'Referral Reward! 🎉',
    'You earned $' || v_reward_amount::text || ' bonus for a successful referral!',
    'referral'
  );

  RETURN NEW;
END;
$$;
