
-- Scheduled Aimtell push notifications
CREATE TABLE public.scheduled_aimtell_pushes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  url TEXT DEFAULT 'https://opoll.org',
  segment_id TEXT,
  broadcast_all BOOLEAN DEFAULT false,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_aimtell_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scheduled pushes"
ON public.scheduled_aimtell_pushes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Auto-broadcast settings table
CREATE TABLE public.aimtell_auto_broadcast_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL DEFAULT '',
  url_template TEXT DEFAULT 'https://opoll.org',
  segment_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.aimtell_auto_broadcast_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto-broadcast settings"
ON public.aimtell_auto_broadcast_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Seed default auto-broadcast events
INSERT INTO public.aimtell_auto_broadcast_settings (event_type, enabled, title_template, body_template, url_template) VALUES
  ('market_created', false, 'New Market: {{title}} 🔥', 'A new prediction market just went live!', 'https://opoll.org/market/{{market_id}}'),
  ('market_resolved', false, 'Market Resolved: {{title}} ✅', 'Results are in! Check if you won.', 'https://opoll.org/market/{{market_id}}'),
  ('market_trending', false, '🔥 Trending: {{title}}', 'This market is heating up! Join the action.', 'https://opoll.org/market/{{market_id}}'),
  ('big_deposit', false, '💰 Big Move Alert', 'A whale just deposited. Markets are heating up!', 'https://opoll.org'),
  ('new_sports_market', false, '⚽ New Sports Market!', '{{title}} — Predict the outcome now!', 'https://opoll.org/market/{{market_id}}');

-- Push notification templates for reuse
CREATE TABLE public.aimtell_push_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  url TEXT DEFAULT 'https://opoll.org',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.aimtell_push_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage push templates"
ON public.aimtell_push_templates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Seed common templates
INSERT INTO public.aimtell_push_templates (name, title, body, url) VALUES
  ('New Market Alert', 'New Market Alert! 🔥', 'A hot new prediction market just went live. Check it out!', 'https://opoll.org'),
  ('Market Closing Soon', '⏰ Market Closing Soon!', 'Last chance to make your prediction before this market closes.', 'https://opoll.org'),
  ('Win Celebration', 'You Won! 🎉', 'Congratulations! Check your portfolio for your winnings.', 'https://opoll.org/portfolio'),
  ('Deposit Bonus', '💰 Deposit Bonus Active!', 'Deposit now and get a bonus on your first prediction.', 'https://opoll.org'),
  ('Quick Trade Promo', '⚡ Quick Trade is Live!', 'Predict price movements and win in seconds. Try Quick Trade now!', 'https://opoll.org/quick-trade'),
  ('Weekend Special', '🎯 Weekend Special Markets!', 'Special prediction markets are live this weekend. Don''t miss out!', 'https://opoll.org'),
  ('Come Back', 'We Miss You! 👋', 'New markets are waiting for your predictions. Come back and trade!', 'https://opoll.org'),
  ('Sports Alert', '⚽ Game Day Alert!', 'Big match predictions are live. Make your call now!', 'https://opoll.org');

-- Index for scheduled push processing
CREATE INDEX idx_scheduled_pushes_pending ON public.scheduled_aimtell_pushes (scheduled_at) WHERE status = 'scheduled';
