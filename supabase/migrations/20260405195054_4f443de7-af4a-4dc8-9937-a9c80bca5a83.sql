CREATE OR REPLACE FUNCTION public.increment_bc400_pool(_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.commission_settings
  SET bc400_pool_balance = bc400_pool_balance + _amount,
      updated_at = now()
  WHERE id = (SELECT id FROM public.commission_settings LIMIT 1);
END;
$$;