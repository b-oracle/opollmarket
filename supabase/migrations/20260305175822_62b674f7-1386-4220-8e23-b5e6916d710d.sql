
-- Create a function to expire stale pending deposits (older than 1 hour)
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
    AND created_at < now() - interval '1 hour';

  UPDATE public.market_boosts
  SET status = 'expired'
  WHERE status = 'pending'
    AND created_at < now() - interval '1 hour';
END;
$$;

-- Expire any currently stale pending deposits right now
SELECT public.expire_stale_pending_deposits();
