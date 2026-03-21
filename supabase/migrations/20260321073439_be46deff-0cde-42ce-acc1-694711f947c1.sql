
-- Create social_ads table
CREATE TABLE public.social_ads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  headline text,
  video_url text,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_ads ENABLE ROW LEVEL SECURITY;

-- Anyone can read active ads (needed to render in feeds)
CREATE POLICY "Active social ads are publicly readable"
  ON public.social_ads FOR SELECT
  USING (status = 'active' AND ends_at > now());

-- Users can read their own ads regardless of status
CREATE POLICY "Users can read own social ads"
  ON public.social_ads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can read all social ads"
  ON public.social_ads FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update social ads
CREATE POLICY "Admins can update social ads"
  ON public.social_ads FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add social_ad_price to commission_settings
ALTER TABLE public.commission_settings
  ADD COLUMN social_ad_price numeric NOT NULL DEFAULT 10;

-- Add index for active ads lookup
CREATE INDEX idx_social_ads_active ON public.social_ads (status, ends_at) WHERE status = 'active';
