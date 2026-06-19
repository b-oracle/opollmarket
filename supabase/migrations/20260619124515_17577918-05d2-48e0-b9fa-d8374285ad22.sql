
-- 1. Profiles: revoke peer-readable sensitive columns from authenticated/anon
REVOKE SELECT (email, date_of_birth, age, gender, location, kyc_status, is_blocked, block_reason, blocked_at)
  ON public.profiles FROM authenticated, anon;

-- Re-assert service_role has full access (no-op if already granted)
GRANT ALL ON public.profiles TO service_role;

-- 2. Owner-scoped block check (avoids needing column SELECT on is_blocked)
CREATE OR REPLACE FUNCTION public.am_i_blocked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_blocked FROM public.profiles WHERE id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.am_i_blocked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.am_i_blocked() TO authenticated, service_role;

-- 3. user_security_settings: revoke raw secret columns from client roles
REVOKE SELECT (totp_secret, pin_hash) ON public.user_security_settings FROM authenticated, anon;
GRANT ALL ON public.user_security_settings TO service_role;

-- 4. Space recordings storage policy: restrict to authenticated only (drop public role)
DROP POLICY IF EXISTS "Viewers can read space recordings" ON storage.objects;
CREATE POLICY "Viewers can read space recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  (bucket_id = 'space-recordings'::text) AND (
    ((auth.uid())::text = (storage.foldername(name))[1])
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.recording_url = objects.name
        AND (
          s.host_id = auth.uid()
          OR s.is_private = false
          OR public.is_space_participant(s.id, auth.uid())
        )
    ))
  )
);
