CREATE OR REPLACE FUNCTION public.expire_stale_pending_deposits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.transactions
  SET status = 'expired'
  WHERE type = 'deposit'
    AND status = 'pending'
    AND created_at < now() - interval '2 hours';

  UPDATE public.market_boosts
  SET status = 'expired'
  WHERE status = 'pending'
    AND created_at < now() - interval '2 hours';
END;
$$;