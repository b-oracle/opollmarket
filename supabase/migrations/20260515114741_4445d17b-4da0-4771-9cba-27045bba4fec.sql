
-- 1) Revoke direct SELECT on sensitive columns from public-facing roles
REVOKE SELECT (email, wallet_address, gender, location, date_of_birth, kyc_status, is_blocked, blocked_at, block_reason)
  ON public.profiles FROM anon, authenticated;

-- 2) Owner self-read of full profile via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_my_full_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_full_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated;

-- 3) Admin lookup by ids (returns email + basic identity)
CREATE OR REPLACE FUNCTION public.admin_get_profiles_with_email(_ids uuid[])
RETURNS TABLE (
  id uuid,
  display_name text,
  username text,
  email text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
    OR public.has_role(auth.uid(), 'business'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.username, p.email, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_profiles_with_email(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_profiles_with_email(uuid[]) TO authenticated;

-- 4) Admin search by name/username/email with paging — returns full profile rows
CREATE OR REPLACE FUNCTION public.admin_search_profiles(
  _term text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  rows jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_rows jsonb;
  v_pattern text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_pattern := CASE WHEN _term IS NULL OR length(trim(_term)) = 0
                    THEN NULL
                    ELSE '%' || trim(_term) || '%'
               END;

  SELECT count(*) INTO v_total
  FROM public.profiles p
  WHERE v_pattern IS NULL
     OR p.display_name ILIKE v_pattern
     OR p.username ILIKE v_pattern
     OR p.email ILIKE v_pattern;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT p.*
    FROM public.profiles p
    WHERE v_pattern IS NULL
       OR p.display_name ILIKE v_pattern
       OR p.username ILIKE v_pattern
       OR p.email ILIKE v_pattern
    ORDER BY p.created_at DESC
    LIMIT GREATEST(_limit, 0)
    OFFSET GREATEST(_offset, 0)
  ) t;

  rows := v_rows;
  total_count := v_total;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_profiles(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(text, int, int) TO authenticated;
