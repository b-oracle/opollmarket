CREATE OR REPLACE FUNCTION public.get_platform_user_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer FROM public.profiles;
$$;