
ALTER TABLE public.markets ADD COLUMN stream_url text;
ALTER TABLE public.markets ADD COLUMN is_streaming boolean NOT NULL DEFAULT false;

INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('market_streaming', 'Market Live Streaming', true)
ON CONFLICT DO NOTHING;
