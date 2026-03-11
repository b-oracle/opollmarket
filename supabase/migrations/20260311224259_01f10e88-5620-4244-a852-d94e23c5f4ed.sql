
-- 1. Add verification flag
ALTER TABLE public.markets ADD COLUMN liquidity_verified boolean NOT NULL DEFAULT false;

-- 2. Auto-verify when liquidity transaction is recorded
CREATE OR REPLACE FUNCTION public.verify_market_liquidity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.side = 'initial_liquidity' AND NEW.status = 'confirmed' AND NEW.market_id IS NOT NULL THEN
    UPDATE public.markets SET liquidity_verified = true WHERE id = NEW.market_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_verify_market_liquidity
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.verify_market_liquidity();

-- 3. Flag unverified markets (admin-callable RPC)
CREATE OR REPLACE FUNCTION public.flag_unverified_liquidity()
RETURNS TABLE(market_id uuid, title text, creator_wallet text, initial_liquidity numeric, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, title, creator_wallet, initial_liquidity, created_at
  FROM public.markets
  WHERE initial_liquidity > 0
    AND liquidity_verified = false
    AND created_at < now() - interval '5 minutes'
    AND status != 'cancelled';
$$;
