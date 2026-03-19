
-- Add market_id column to stories table
ALTER TABLE public.stories ADD COLUMN market_id uuid REFERENCES public.markets(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX idx_stories_market_id ON public.stories(market_id) WHERE market_id IS NOT NULL;
