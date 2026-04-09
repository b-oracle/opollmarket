
-- Add username column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- Create unique index (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique ON public.profiles (lower(username));

-- Function to generate a unique username from a display name
CREATE OR REPLACE FUNCTION public.generate_unique_username(_display_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _base text;
  _candidate text;
  _suffix int;
BEGIN
  -- Sanitize: lowercase, keep only alphanumeric and underscores, trim
  _base := lower(regexp_replace(COALESCE(NULLIF(TRIM(_display_name), ''), 'user'), '[^a-z0-9_]', '', 'g'));
  
  -- Ensure minimum length
  IF length(_base) < 3 THEN
    _base := _base || 'user';
  END IF;
  
  -- Truncate to reasonable length
  _base := left(_base, 20);
  
  -- Try the base name first
  _candidate := _base;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE lower(username) = _candidate) THEN
    RETURN _candidate;
  END IF;
  
  -- Append random digits until unique
  FOR _suffix IN 1..100 LOOP
    _candidate := _base || floor(random() * 9000 + 1000)::text;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE lower(username) = _candidate) THEN
      RETURN _candidate;
    END IF;
  END LOOP;
  
  -- Fallback: use UUID fragment
  RETURN _base || left(replace(gen_random_uuid()::text, '-', ''), 6);
END;
$$;

-- Backfill existing users
UPDATE public.profiles
SET username = public.generate_unique_username(COALESCE(display_name, 'user'))
WHERE username IS NULL;

-- Now make it NOT NULL with a default
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN username SET DEFAULT '';

-- Update handle_new_user to generate username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referred_by uuid;
  v_display_name text;
  v_username text;
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

  -- Generate unique username
  v_username := public.generate_unique_username(v_display_name);

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
$$;
