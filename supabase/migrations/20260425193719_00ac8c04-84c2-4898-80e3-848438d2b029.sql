-- 1) Block self-referral and founder-referral at the column level
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_no_self_referral;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_no_self_referral
  CHECK (
    referred_by IS NULL
    OR (
      referred_by <> id
      AND referred_by <> 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid  -- BOracle
      AND referred_by <> 'cef65e17-6d57-4ce4-8eec-82a0906f9bc5'::uuid  -- AgentBG
    )
  ) NOT VALID;
-- NOT VALID so existing data isn't blocked; new/changed rows are enforced.

-- 2) Lock referred_by after first set (non-admins cannot rotate referrer)
CREATE OR REPLACE FUNCTION public.guard_referred_by_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid;
BEGIN
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    _caller := auth.uid();
    -- Service role / triggers (no auth.uid()) and super_admins are allowed.
    IF _caller IS NOT NULL
       AND NOT public.has_role(_caller, 'super_admin') THEN
      -- Allow first-time set (was NULL → now set), block edits & clears.
      IF OLD.referred_by IS NOT NULL THEN
        RAISE EXCEPTION 'referred_by is locked once set; contact support to change it';
      END IF;
    END IF;

    -- Always block self / founder referral, even via service role.
    IF NEW.referred_by IS NOT NULL AND (
         NEW.referred_by = NEW.id
      OR NEW.referred_by = 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid
      OR NEW.referred_by = 'cef65e17-6d57-4ce4-8eec-82a0906f9bc5'::uuid
    ) THEN
      NEW.referred_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_referred_by ON public.profiles;
CREATE TRIGGER trg_guard_referred_by
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_referred_by_changes();

-- 3) Defense-in-depth uniqueness on (referrer, referred)
CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_referrer_referred_uidx
  ON public.referral_rewards (referrer_id, referred_id);

-- 4) Signup device fingerprint table for IP/device sybil checks
CREATE TABLE IF NOT EXISTS public.signup_device_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  referrer_id uuid,
  ip_address text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_fp_referrer_ip_idx
  ON public.signup_device_fingerprints (referrer_id, ip_address)
  WHERE referrer_id IS NOT NULL AND ip_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS signup_fp_referrer_uahash_idx
  ON public.signup_device_fingerprints (referrer_id, user_agent_hash)
  WHERE referrer_id IS NOT NULL AND user_agent_hash IS NOT NULL;

ALTER TABLE public.signup_device_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admins read fingerprints" ON public.signup_device_fingerprints;
CREATE POLICY "super_admins read fingerprints"
  ON public.signup_device_fingerprints
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- No insert/update/delete policies → only service role (or definer functions) can write.

-- 5) Strengthen handle_new_user: drop self-referral, sybil-check by IP & UA hash
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
  v_ip text;
  v_ua text;
  v_ua_hash text;
  v_ip_sybil bigint := 0;
  v_ua_sybil bigint := 0;
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

  -- ── Anti-abuse: drop self / founder referrals ──
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

  BEGIN
    INSERT INTO public.balances (user_id, amount, bonus_balance, currency)
    VALUES (NEW.id, 0, v_signup_bonus, 'USDT');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to create balance for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow founders + referrer (unchanged)
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

  -- ── Capture device fingerprint for sybil checks ──
  v_ip := NULLIF(NEW.raw_user_meta_data->>'signup_ip', '');
  v_ua := NULLIF(NEW.raw_user_meta_data->>'signup_ua', '');
  IF v_ua IS NOT NULL THEN
    v_ua_hash := encode(digest(v_ua, 'sha256'), 'hex');
  END IF;

  BEGIN
    INSERT INTO public.signup_device_fingerprints (user_id, referrer_id, ip_address, user_agent_hash)
    VALUES (NEW.id, v_referred_by, v_ip, v_ua_hash);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: fingerprint capture failed for %: %', NEW.id, SQLERRM;
  END;

  -- ── Instant referral reward with multi-vector sybil checks ──
  IF v_referred_by IS NOT NULL THEN
    BEGIN
      v_user_email := NEW.email;
      v_normalized_email := public.normalize_email(v_user_email);

      -- Email-based sybil (existing)
      SELECT count(*) INTO v_sybil_count
      FROM public.referral_rewards rr
      JOIN public.profiles p ON p.id = rr.referred_id
      WHERE rr.referrer_id = v_referred_by
        AND public.normalize_email(p.email) = v_normalized_email;

      -- IP-based sybil (last 30 days, same referrer)
      IF v_ip IS NOT NULL THEN
        SELECT count(*) INTO v_ip_sybil
        FROM public.signup_device_fingerprints
        WHERE referrer_id = v_referred_by
          AND ip_address = v_ip
          AND user_id <> NEW.id
          AND created_at >= now() - interval '30 days';
      END IF;

      -- UA-hash sybil (last 30 days, same referrer)
      IF v_ua_hash IS NOT NULL THEN
        SELECT count(*) INTO v_ua_sybil
        FROM public.signup_device_fingerprints
        WHERE referrer_id = v_referred_by
          AND user_agent_hash = v_ua_hash
          AND user_id <> NEW.id
          AND created_at >= now() - interval '30 days';
      END IF;

      IF v_sybil_count = 0 AND v_ip_sybil = 0 AND v_ua_sybil = 0 THEN
        SELECT referral_reward_amount INTO v_reward_amount
        FROM public.commission_settings LIMIT 1;
        v_reward_amount := COALESCE(v_reward_amount, 2);

        IF v_reward_amount > 0 THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.referral_rewards
            WHERE referrer_id = v_referred_by AND referred_id = NEW.id
          ) THEN
            -- Insert is also protected by the UNIQUE(referred_id) constraint
            -- and the new UNIQUE(referrer_id, referred_id) index.
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
        RAISE WARNING 'Sybil referral blocked: % referrer % (email=%, ip=%, ua=%)',
          v_user_email, v_referred_by, v_sybil_count, v_ip_sybil, v_ua_sybil;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user: referral reward failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;