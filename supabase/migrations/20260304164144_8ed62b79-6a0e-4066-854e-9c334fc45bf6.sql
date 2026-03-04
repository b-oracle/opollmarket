
-- Create a trigger function that fires when a user's first buy transaction is inserted.
-- It checks if the user was referred, and if so, credits the referrer's bonus balance
-- and records the referral reward.
CREATE OR REPLACE FUNCTION public.handle_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referred_by uuid;
  v_reward_amount numeric;
  v_existing_buys bigint;
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
  SELECT referred_by INTO v_referred_by
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

-- Create the trigger on the transactions table
DROP TRIGGER IF EXISTS on_first_bet_referral_reward ON public.transactions;
CREATE TRIGGER on_first_bet_referral_reward
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_reward();
