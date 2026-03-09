
-- Add configurable copy trade commission % to commission_settings
ALTER TABLE public.commission_settings
ADD COLUMN copy_trade_commission_percent numeric NOT NULL DEFAULT 10;

-- Table to track earnings from copied trades
CREATE TABLE public.copy_trade_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trader_user_id uuid NOT NULL,
  copier_user_id uuid NOT NULL,
  pending_trade_id uuid REFERENCES public.pending_copy_trades(id),
  market_id uuid REFERENCES public.markets(id),
  trade_type text NOT NULL DEFAULT 'prediction',
  copier_profit numeric NOT NULL DEFAULT 0,
  commission_percent numeric NOT NULL DEFAULT 10,
  commission_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.copy_trade_earnings ENABLE ROW LEVEL SECURITY;

-- Traders can see earnings from their copiers
CREATE POLICY "Traders can read own copy earnings"
  ON public.copy_trade_earnings FOR SELECT
  USING (auth.uid() = trader_user_id);

-- Copiers can see commissions they paid
CREATE POLICY "Copiers can read own copy earnings"
  ON public.copy_trade_earnings FOR SELECT
  USING (auth.uid() = copier_user_id);

-- Admins can read all
CREATE POLICY "Admins can read all copy earnings"
  ON public.copy_trade_earnings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- DB function to get trader copy stats
CREATE OR REPLACE FUNCTION public.get_copy_trade_stats(_trader_id uuid)
RETURNS TABLE(total_copiers bigint, total_revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(DISTINCT user_id) FROM public.copy_settings WHERE target_user_id = _trader_id AND auto_copy = true) AS total_copiers,
    COALESCE((SELECT SUM(commission_amount) FROM public.copy_trade_earnings WHERE trader_user_id = _trader_id), 0) AS total_revenue;
$$;
