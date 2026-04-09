
-- 1. Backfill existing NULL/empty usernames
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, display_name FROM profiles WHERE username IS NULL OR username = '' LOOP
    UPDATE profiles SET username = generate_unique_username(COALESCE(r.display_name, 'user'))
    WHERE id = r.id;
  END LOOP;
END $$;

-- 2. Add NOT NULL constraint with default
ALTER TABLE public.profiles ALTER COLUMN username SET DEFAULT 'user';
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;

-- 3. Add unique index (case-insensitive) if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique ON public.profiles (lower(username));

-- 4. Update handle_new_user to read username from metadata
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
  v_signup_bonus numeric := 2;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL
       AND NEW.raw_user_meta_data->>'referred_by' != ''
    THEN
      v_referred_by := (NEW.raw_user_meta_data->>'referred_by')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    v_referred_by := NULL;
  END;

  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Use username from metadata if provided, otherwise auto-generate
  v_meta_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
  IF v_meta_username IS NOT NULL AND length(v_meta_username) >= 3 THEN
    -- Sanitize: lowercase, keep only alphanumeric and underscores
    v_meta_username := lower(regexp_replace(v_meta_username, '[^a-z0-9_]', '', 'g'));
    -- Check uniqueness
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

  -- Create balance with $2 signup bonus
  BEGIN
    INSERT INTO public.balances (user_id, amount, bonus_balance, currency)
    VALUES (NEW.id, 0, v_signup_bonus, 'USDT');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to create balance for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow BOracle
  BEGIN
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (NEW.id, v_boracle_id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to auto-follow BOracle for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow AgentBG
  BEGIN
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (NEW.id, v_agentbg_id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to auto-follow AgentBG for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow referrer if provided
  IF v_referred_by IS NOT NULL
     AND v_referred_by IS DISTINCT FROM v_boracle_id
     AND v_referred_by IS DISTINCT FROM v_agentbg_id
  THEN
    BEGIN
      INSERT INTO public.follows (follower_id, following_id)
      VALUES (NEW.id, v_referred_by);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user: failed to auto-follow referrer for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  -- Instant referral reward
  IF v_referred_by IS NOT NULL THEN
    BEGIN
      v_user_email := NEW.email;
      v_normalized_email := public.normalize_email(v_user_email);
      SELECT count(*) INTO v_sybil_count
      FROM public.referral_rewards rr
      JOIN public.profiles p ON p.id = rr.referred_id
      WHERE rr.referrer_id = v_referred_by
        AND public.normalize_email(p.email) = v_normalized_email;

      IF v_sybil_count = 0 THEN
        SELECT referral_reward_amount INTO v_reward_amount
        FROM public.commission_settings LIMIT 1;
        v_reward_amount := COALESCE(v_reward_amount, 2);

        IF v_reward_amount > 0 THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.referral_rewards
            WHERE referrer_id = v_referred_by AND referred_id = NEW.id
          ) THEN
            INSERT INTO public.referral_rewards (referrer_id, referred_id, amount)
            VALUES (v_referred_by, NEW.id, v_reward_amount);

            UPDATE public.balances
            SET bonus_balance = bonus_balance + v_reward_amount, updated_at = now()
            WHERE user_id = v_referred_by;

            INSERT INTO public.notifications (user_id, title, message, type)
            VALUES (
              v_referred_by,
              'Referral Reward! 🎉',
              'You earned $' || v_reward_amount::text || ' bonus — someone just signed up with your referral!',
              'referral'
            );
          END IF;
        END IF;
      ELSE
        RAISE WARNING 'Sybil referral blocked at registration: % referrer %', v_user_email, v_referred_by;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user: referral reward failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
