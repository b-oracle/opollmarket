
CREATE TABLE public.twitter_auto_post_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  tweet_template text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.twitter_auto_post_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage twitter auto-post settings"
ON public.twitter_auto_post_settings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default templates
INSERT INTO public.twitter_auto_post_settings (event_type, tweet_template) VALUES
('market_created', '🔥 New Market: {{title}}\n\nWhat''s your OPinion? Predict now 👇\nhttps://opoll.org/market/{{market_id}}'),
('market_resolved', '✅ Market Resolved: {{title}}\n\nOutcome: {{outcome}}\n\nSee results 👇\nhttps://opoll.org/market/{{market_id}}'),
('space_started', '🎙️ LIVE NOW: "{{title}}" hosted by {{host_name}}\n\nJoin the conversation 👇\nhttps://opoll.org/feed?space={{space_id}}'),
('milestone_achieved', '🏆 {{user_name}} just hit {{milestone}}! 🎉\n\nJoin OPollmarket and start your journey 👇\nhttps://opoll.org');
