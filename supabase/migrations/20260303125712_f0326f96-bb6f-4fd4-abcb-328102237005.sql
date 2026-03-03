
-- Add market_type to markets table
ALTER TABLE public.markets ADD COLUMN market_type text NOT NULL DEFAULT 'binary';

-- Create market_options table for multi-option markets
CREATE TABLE public.market_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  label text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.market_options ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Market options are publicly readable"
  ON public.market_options FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert market options"
  ON public.market_options FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Market options can be updated"
  ON public.market_options FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
