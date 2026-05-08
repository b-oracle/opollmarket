REVOKE ALL ON FUNCTION public.create_market_atomic(jsonb, text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_market_atomic(jsonb, text[], uuid) TO authenticated;