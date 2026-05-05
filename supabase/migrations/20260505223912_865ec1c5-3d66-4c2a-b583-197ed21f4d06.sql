
-- 1. quick_rounds
DROP POLICY IF EXISTS "Authenticated users can create rounds" ON public.quick_rounds;
DROP POLICY IF EXISTS "Authenticated users can update rounds" ON public.quick_rounds;

CREATE POLICY "Only admins can create rounds"
  ON public.quick_rounds FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Only admins can update rounds"
  ON public.quick_rounds FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2. profiles
DROP POLICY IF EXISTS "Authenticated can read public profiles" ON public.profiles;
DROP VIEW IF EXISTS public.public_profiles CASCADE;

CREATE VIEW public.public_profiles
WITH (security_invoker = on) AS
SELECT
  id, display_name, username, avatar_url, bio, is_public, verification_level,
  twitter_username, twitter_avatar_url, unlimited_markets, created_at, age, interests
FROM public.profiles
WHERE
  is_public = true
  OR id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.follows f
    WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
       OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
  OR public.has_role(auth.uid(), 'super_admin');

GRANT SELECT ON public.public_profiles TO authenticated, anon;

CREATE POLICY "Authenticated can read public profile rows"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM public.follows f
      WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
         OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
    )
  );

REVOKE SELECT (email, date_of_birth, gender, location, block_reason, blocked_at, is_blocked, kyc_status, wallet_address)
  ON public.profiles FROM authenticated;

GRANT SELECT (
  id, display_name, username, avatar_url, bio, is_public, verification_level,
  twitter_username, twitter_id, twitter_avatar_url, twitter_linked_at,
  unlimited_markets, created_at, updated_at, referred_by, social_tutorial_seen,
  age, interests
) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_profile_admin(_user_id uuid)
RETURNS public.profiles
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.profiles;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'moderator') OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'support')
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO result FROM public.profiles WHERE id = _user_id;
  RETURN result;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_user_profile_admin(uuid) TO authenticated;

-- 3. notification_email_outbox
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='notification_email_outbox') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users read own outbox" ON public.notification_email_outbox';
    EXECUTE 'CREATE POLICY "Users read own outbox" ON public.notification_email_outbox FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

-- 4. PIN/TOTP rate limiter
CREATE TABLE IF NOT EXISTS public.user_security_attempts (
  user_id uuid PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_security_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_security_attempt(_user_id uuid, _success boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec public.user_security_attempts;
        win interval := interval '5 minutes';
        max_attempts integer := 5;
BEGIN
  SELECT * INTO rec FROM public.user_security_attempts WHERE user_id = _user_id FOR UPDATE;
  IF rec IS NULL THEN
    INSERT INTO public.user_security_attempts (user_id, attempt_count, window_started_at)
    VALUES (_user_id, CASE WHEN _success THEN 0 ELSE 1 END, now()) RETURNING * INTO rec;
    RETURN jsonb_build_object('allowed', true, 'attempts', rec.attempt_count);
  END IF;
  IF rec.locked_until IS NOT NULL AND rec.locked_until > now() THEN
    RETURN jsonb_build_object('allowed', false, 'locked_until', rec.locked_until);
  END IF;
  IF rec.window_started_at + win < now() THEN
    rec.attempt_count := 0; rec.window_started_at := now(); rec.locked_until := NULL;
  END IF;
  IF _success THEN
    UPDATE public.user_security_attempts
    SET attempt_count=0, window_started_at=now(), locked_until=NULL, updated_at=now()
    WHERE user_id=_user_id;
    RETURN jsonb_build_object('allowed', true, 'attempts', 0);
  END IF;
  rec.attempt_count := rec.attempt_count + 1;
  UPDATE public.user_security_attempts
  SET attempt_count=rec.attempt_count, window_started_at=rec.window_started_at,
      locked_until = CASE WHEN rec.attempt_count >= max_attempts THEN now() + win ELSE NULL END,
      updated_at = now()
  WHERE user_id = _user_id;
  IF rec.attempt_count >= max_attempts THEN
    RETURN jsonb_build_object('allowed', false, 'locked_until', now() + win);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'attempts', rec.attempt_count);
END; $$;

REVOKE ALL ON FUNCTION public.record_security_attempt(uuid, boolean) FROM PUBLIC, authenticated, anon;
