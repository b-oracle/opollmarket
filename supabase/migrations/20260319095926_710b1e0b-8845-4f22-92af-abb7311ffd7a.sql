
-- Add Twitter engagement tracking columns to markets
ALTER TABLE public.markets
ADD COLUMN IF NOT EXISTS twitter_metric_type text,
ADD COLUMN IF NOT EXISTS twitter_resource_id text,
ADD COLUMN IF NOT EXISTS twitter_current_count integer DEFAULT 0;

-- twitter_metric_type: 'tweets' | 'likes' | 'replies' | 'retweets' (the metric being tracked)
-- twitter_resource_id: tweet ID or user ID depending on metric
-- twitter_current_count: latest fetched count for live display

COMMENT ON COLUMN public.markets.twitter_metric_type IS 'Type of Twitter metric tracked: tweets, likes, replies, retweets';
COMMENT ON COLUMN public.markets.twitter_resource_id IS 'Twitter resource ID (tweet ID or user ID)';
COMMENT ON COLUMN public.markets.twitter_current_count IS 'Latest fetched count for live counter display';
