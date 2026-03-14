-- Enable realtime on commodity_price_cache so clients can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE public.commodity_price_cache;