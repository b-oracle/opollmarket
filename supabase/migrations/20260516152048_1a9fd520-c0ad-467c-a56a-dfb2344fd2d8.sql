CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referred_by uuid;
  v_referred_raw text;
  v_display_name text;
  v_username text;
  v_meta_username text;
  v_boracle_id uuid := 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid;
  v_agentbg_id uuid := 'cef65e17-6d57-4ce4-8eec-82a0906f9bc5'::uuid;
  v_signup_bonus numeric;
  v_referral_reward numeric;
  v_bonus_credited boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(registration_bonus_amount, 20), COALESCE(referral_reward_amount, 0)
    INTO v_signup_bonus, v_referral_reward
  FROM public.commission_settings
  LIMIT 1;
  v_signup_bonus := COALESCE(v_signup_bonus, 20);
  v_referral_reward := COALESCE(v_referral_reward, 0);

  v_referred_raw := NULLIF(TRIM(NEW.raw_user_meta_data->>'referred_by'), '');
  IF v_referred_raw IS NOT NULL THEN
    -- Try UUID first
    BEGIN
      v_referred_by := v_referred_raw::uuid;
    EXCEPTION WHEN others THEN
      v_referred_by := NULL;
    END;
    -- Fallback: resolve as username (case-insensitive)
    IF v_referred_by IS NULL THEN
      SELECT id INTO v_referred_by
      FROM public.profiles
      WHERE lower(username) = lower(v_referred_raw)
      LIMIT 1;
    END IF;
  END IF;

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

  IF v_signup_bonus > 0 THEN
    BEGIN
      INSERT INTO public.balances (user_id, amount, bonus_balance, currency)
      VALUES (NEW.id, 0, v_signup_bonus, 'USDT')
      ON CONFLICT (user_id, currency)
      DO UPDATE SET bonus_balance = public.balances.bonus_balance + v_signup_bonus;
      v_bonus_credited := true;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user: failed to credit signup bonus for %: %', NEW.id, SQLERRM;
    END;

    IF v_bonus_credited THEN
      BEGIN
        INSERT INTO public.transactions (user_id, type, amount, bonus_amount, status, description)
        VALUES (NEW.id, 'registration_bonus', v_signup_bonus, v_signup_bonus, 'confirmed',
                'Welcome bonus credited to bonus balance on signup');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'handle_new_user: failed to log registration_bonus tx for %: %', NEW.id, SQLERRM;
      END;

      BEGIN
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (
          NEW.id,
          'Welcome Bonus 🎁',
          'You received a $' || trim(to_char(v_signup_bonus, 'FM999990.00')) ||
            ' welcome bonus. Tap to see your balance breakdown.',
          'welcome_bonus'
        );
      EXCEPTION WHEN others THEN
        RAISE WARNING 'handle_new_user: failed to insert welcome notification for %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;

  IF v_referred_by IS NOT NULL AND v_referral_reward > 0 THEN
    BEGIN
      INSERT INTO public.balances (user_id, amount, bonus_balance, currency)
      VALUES (v_referred_by, 0, v_referral_reward, 'USDT')
      ON CONFLICT (user_id, currency)
      DO UPDATE SET bonus_balance = public.balances.bonus_balance + v_referral_reward;

      INSERT INTO public.referral_rewards (referrer_id, referred_id, amount, currency)
      VALUES (v_referred_by, NEW.id, v_referral_reward, 'USDT')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.transactions (user_id, type, amount, bonus_amount, status, description)
      VALUES (v_referred_by, 'referral_bonus', v_referral_reward, v_referral_reward, 'confirmed',
              'Referral signup bonus');

      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        v_referred_by,
        'New Referral 🎉',
        'A friend signed up using your link. You earned $' ||
          trim(to_char(v_referral_reward, 'FM999990.00')) || ' bonus.',
        'referral_signup'
      );
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user: failed to credit referral reward for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;