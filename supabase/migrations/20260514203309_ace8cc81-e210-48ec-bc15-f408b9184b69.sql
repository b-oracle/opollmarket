CREATE OR REPLACE FUNCTION public.get_user_referral_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN 0
    WHEN auth.uid() = _user_id
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'moderator'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    THEN (
      SELECT count(*)::integer
      FROM public.profiles
      WHERE referred_by = _user_id
    )
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_referral_signups(_user_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.created_at
  FROM public.profiles p
  WHERE p.referred_by = _user_id
    AND _user_id IS NOT NULL
    AND (
      auth.uid() = _user_id
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'moderator'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_referral_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_referral_signups(uuid) TO authenticated;