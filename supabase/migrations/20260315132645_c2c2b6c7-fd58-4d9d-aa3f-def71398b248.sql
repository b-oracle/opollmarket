INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('tradingview_chart', 'TradingView Chart (Quick Trade)', false)
ON CONFLICT DO NOTHING;