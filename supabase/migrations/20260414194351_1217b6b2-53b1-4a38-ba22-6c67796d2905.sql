-- Fix get_user_id_by_username to match against username instead of display_name
CREATE OR REPLACE FUNCTION public.get_user_id_by_username(_username text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE lower(username) = lower(_username) LIMIT 1
$$;

-- Fix is_valid_referral_code (text overload) to match against username instead of display_name
CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(_code)
  )
$$;
