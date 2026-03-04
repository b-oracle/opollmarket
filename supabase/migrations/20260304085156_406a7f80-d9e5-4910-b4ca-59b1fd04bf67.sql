
CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _code
  )
$$;
