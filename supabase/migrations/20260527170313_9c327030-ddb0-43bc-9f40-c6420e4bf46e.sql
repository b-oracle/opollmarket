
-- 1) Restrict sensitive profile columns from broad authenticated/anon reads.
-- Table-wide SELECT remains for safe columns; PII (email, DOB, gender, age, location)
-- becomes accessible only through SECURITY DEFINER RPCs (owner + admin/support).
REVOKE SELECT (email, date_of_birth, gender, age, location)
  ON public.profiles FROM anon, authenticated;

-- Allow owner to still SELECT their own sensitive cols via the existing
-- get_my_full_profile() SECURITY DEFINER function (already returns full row).
-- Add an admin/support-scoped function for lookups that previously hit email directly.
CREATE OR REPLACE FUNCTION public.admin_get_user_emails(_user_ids uuid[])
RETURNS TABLE (id uuid, email text, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.display_name
  FROM public.profiles p
  WHERE p.id = ANY(_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_emails(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_emails(uuid[]) TO authenticated;

-- Admin search across email + display_name without exposing email column to client filter.
CREATE OR REPLACE FUNCTION public.admin_search_profiles(_q text)
RETURNS TABLE (id uuid, email text, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.display_name
  FROM public.profiles p
  WHERE lower(p.email) LIKE '%' || lower(_q) || '%'
     OR lower(p.display_name) LIKE '%' || lower(_q) || '%'
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_profiles(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(text) TO authenticated;

-- 2) analytics_events: let owners read their own events.
CREATE POLICY "Users can read own analytics events"
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3) Tighten storage policy for space-recordings so participants of space A
--    cannot read recordings from space B (even when both share a host).
DROP POLICY IF EXISTS "Participants can read space recordings" ON storage.objects;
CREATE POLICY "Participants can read space recordings"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'space-recordings'
    AND (
      -- Owner of the file (host) uploaded under their own folder
      (auth.uid())::text = (storage.foldername(name))[1]
      -- Host of any space
      OR EXISTS (
        SELECT 1 FROM public.spaces s
        WHERE s.host_id = auth.uid()
          AND s.recording_url = objects.name
      )
      -- Participants: must have joined the SPECIFIC space whose recording this is.
      OR EXISTS (
        SELECT 1
        FROM public.space_participants sp
        JOIN public.spaces s ON s.id = sp.space_id
        WHERE sp.user_id = auth.uid()
          AND sp.left_at IS NOT NULL
          AND s.recording_url = objects.name
      )
      -- Admins
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );
