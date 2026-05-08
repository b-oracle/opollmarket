CREATE OR REPLACE FUNCTION public.db_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT now();
$$;
GRANT EXECUTE ON FUNCTION public.db_now() TO anon, authenticated, service_role;