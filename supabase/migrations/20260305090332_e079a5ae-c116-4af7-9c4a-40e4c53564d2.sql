
CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(display_name) = lower(_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_id_by_username(_username text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE lower(display_name) = lower(_username) LIMIT 1
$$;
