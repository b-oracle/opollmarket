
ALTER VIEW public.order_book_entries SET (security_invoker = on);
ALTER VIEW public.market_trades_anonymous SET (security_invoker = on);

-- Grant read access to the views for authenticated users
GRANT SELECT ON public.order_book_entries TO authenticated;
GRANT SELECT ON public.market_trades_anonymous TO authenticated;
