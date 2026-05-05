-- Add registration_bonus_amount setting
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS registration_bonus_amount numeric NOT NULL DEFAULT 2;

-- Expose via public view
DROP VIEW IF EXISTS public.public_commission_settings;
CREATE VIEW public.public_commission_settings
WITH (security_invoker = true)
AS SELECT * FROM public.commission_settings;

GRANT SELECT ON public.public_commission_settings TO anon, authenticated;

-- Update handle_new_user to read both bonuses from commission_settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referred_by uuid;
  v_display_name text;
  v_username text;
  v_meta_username text;
  v_boracle_id uuid := 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid;
  v_agentbg_id uuid := 'cef65e17-6d57-4ce4-8eec-82a0906f9bc5'::uuid;
  v_reward_amount numeric;
  v_user_email text;
  v_normalized_email text;
  v_sybil_count bigint;
  v_signup_bonus numeric;
  v_referral_reward numeric;
  v_ip text;
  v_ua text;
  v_ua_hash text;
  v_ip_sybil bigint := 0;
  v_ua_sybil bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Read bonus settings (with safe fallbacks)
  SELECT COALESCE(registration_bonus_amount, 2), COALESCE(referral_reward_amount, 0)
    INTO v_signup_bonus, v_referral_reward
  FROM public.commission_settings
  LIMIT 1;
  v_signup_bonus := COALESCE(v_signup_bonus, 2);
  v_referral_reward := COALESCE(v_referral_reward, 0);

  BEGIN
    IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL
       AND NEW.raw_user_meta_data->>'referred_by' != ''
    THEN
      v_referred_by := (NEW.raw_user_meta_data->>'referred_by')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    v_referred_by := NULL;
  END;

  IF v_referred_by IS NOT NULL AND (
       v_referred_by = NEW.id
    OR v_referred_by = v_boracle_id
    OR v_referred_by = v_agentbg_id
  ) THEN
    v_referred_by := NULL;
  END IF;

  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_meta_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
  IF v_meta_username IS NOT NULL AND length(v_meta_username) >= 3 THEN
    v_meta_username := lower(regexp_replace(v_meta_username, '[^a-z0-9_]', '', 'g'));
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE lower(username) = v_meta_username) THEN
      v_username := v_meta_username;
    ELSE
      v_username := public.generate_unique_username(v_display_name);
    END IF;
  ELSE
    v_username := public.generate_unique_username(v_display_name);
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, email, display_name, username, referred_by)
    VALUES (NEW.id, NEW.email, v_display_name, v_username, v_referred_by);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to create profile for %: %', NEW.id, SQLERRM;
  END;

  -- Credit registration bonus to new user (bonus balance)
  BEGIN
    INSERT INTO public.balances (user_id, amount, bonus_balance, currency)
    VALUES (NEW.id, 0, v_signup_bonus, 'USDT');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to create balance for %: %', NEW.id, SQLERRM;
  END;

  -- Credit referral bonus to the referrer (bonus balance) at registration time
  IF v_referred_by IS NOT NULL AND v_referral_reward > 0 THEN
    BEGIN
      INSERT INTO public.balances (user_id, amount, bonus_balance, currency)
      VALUES (v_referred_by, 0, v_referral_reward, 'USDT')
      ON CONFLICT (user_id, currency)
      DO UPDATE SET bonus_balance = public.balances.bonus_balance + v_referral_reward;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user: failed to credit referrer % : %', v_referred_by, SQLERRM;
    END;
  END IF;

  -- Auto-follow founders + referrer
  BEGIN
    INSERT INTO public.follows (follower_id, following_id) VALUES (NEW.id, v_boracle_id);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    INSERT INTO public.follows (follower_id, following_id) VALUES (NEW.id, v_agentbg_id);
  EXCEPTION WHEN others THEN NULL; END;
  IF v_referred_by IS NOT NULL THEN
    BEGIN
      INSERT INTO public.follows (follower_id, following_id) VALUES (NEW.id, v_referred_by);
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  RETURN NEW;
END;
$function$;