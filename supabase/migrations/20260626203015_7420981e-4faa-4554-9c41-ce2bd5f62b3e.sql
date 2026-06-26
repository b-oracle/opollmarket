
REVOKE SELECT (api_key, webhook_secret) ON public.api_keys FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_api_keys()
RETURNS SETOF public.api_keys
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') THEN
    RETURN QUERY SELECT * FROM public.api_keys ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM public.api_keys
      WHERE owner_id = auth.uid()
      ORDER BY created_at DESC;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_api_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_api_keys() TO authenticated;
