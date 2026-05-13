
-- Drop old "first bet" trigger
DROP TRIGGER IF EXISTS on_first_bet_referral_reward ON public.transactions;

-- New function: grant referral reward on signup (profile insert)
CREATE OR REPLACE FUNCTION public.handle_referral_signup_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reward_amount numeric;
  v_normalized_email text;
  v_sybil_count bigint;
BEGIN
  -- Only when this new profile has a referrer
  IF NEW.referred_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if reward already exists
  IF EXISTS (
    SELECT 1 FROM public.referral_rewards
    WHERE referrer_id = NEW.referred_by AND referred_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Sybil check: block if a normalized-email-equivalent account already rewarded this referrer
  v_normalized_email := public.normalize_email(NEW.email);
  IF v_normalized_email IS NOT NULL THEN
    SELECT count(*) INTO v_sybil_count
    FROM public.referral_rewards rr
    JOIN public.profiles p ON p.id = rr.referred_id
    WHERE rr.referrer_id = NEW.referred_by
      AND public.normalize_email(p.email) = v_normalized_email;

    IF v_sybil_count > 0 THEN
      RAISE WARNING 'Sybil referral blocked at signup: % (normalized: %) already rewarded referrer %',
        NEW.email, v_normalized_email, NEW.referred_by;
      RETURN NEW;
    END IF;
  END IF;

  -- Reward amount from settings (fallback $5)
  SELECT referral_reward_amount INTO v_reward_amount
  FROM public.commission_settings
  LIMIT 1;

  IF v_reward_amount IS NULL OR v_reward_amount <= 0 THEN
    v_reward_amount := 5;
  END IF;

  -- Insert reward record
  INSERT INTO public.referral_rewards (referrer_id, referred_id, amount)
  VALUES (NEW.referred_by, NEW.id, v_reward_amount);

  -- Credit referrer's bonus balance (ensure a USDT balance row exists)
  INSERT INTO public.balances (user_id, currency, bonus_balance)
  VALUES (NEW.referred_by, 'USDT', v_reward_amount)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET bonus_balance = public.balances.bonus_balance + v_reward_amount,
                updated_at = now();

  -- Notify referrer
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    NEW.referred_by,
    'Referral Reward! 🎉',
    'You earned $' || v_reward_amount::text || ' bonus — your friend just signed up!',
    'referral'
  );

  RETURN NEW;
END;
$function$;

-- Attach to profiles
DROP TRIGGER IF EXISTS on_signup_referral_reward ON public.profiles;
CREATE TRIGGER on_signup_referral_reward
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_referral_signup_reward();
