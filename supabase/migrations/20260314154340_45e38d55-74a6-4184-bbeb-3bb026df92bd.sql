
-- Fix the stuck Arsenal market: sync participants and volume from actual data
UPDATE public.markets
SET 
  participants = (SELECT COUNT(DISTINCT user_id) FROM public.positions WHERE market_id = 'd7dd1212-6190-4497-94b3-446e6d1d8144' AND shares > 0),
  volume = (SELECT COALESCE(SUM(amount), 0) FROM public.transactions WHERE market_id = 'd7dd1212-6190-4497-94b3-446e6d1d8144' AND type = 'buy' AND status = 'confirmed'),
  yes_price = 0.55,
  no_price = 0.45
WHERE id = 'd7dd1212-6190-4497-94b3-446e6d1d8144';
