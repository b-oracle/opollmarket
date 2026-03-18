
CREATE TABLE public.social_links (
  id text PRIMARY KEY,
  label text NOT NULL,
  url text NOT NULL DEFAULT '',
  icon_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) DEFAULT NULL
);

ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;

-- Everyone can read enabled links
CREATE POLICY "Anyone can read enabled social links"
ON public.social_links FOR SELECT
USING (true);

-- Only admins can modify (using has_role)
CREATE POLICY "Admins can manage social links"
ON public.social_links FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed initial data
INSERT INTO public.social_links (id, label, url, icon_key, enabled, sort_order) VALUES
  ('twitter', 'X (Twitter)', 'https://x.com/opollmarket', 'twitter', true, 0),
  ('telegram', 'Telegram', 'https://t.me/OPoll_market_bot', 'telegram', true, 1),
  ('instagram', 'Instagram', 'https://instagram.com/opollmarket', 'instagram', true, 2);
