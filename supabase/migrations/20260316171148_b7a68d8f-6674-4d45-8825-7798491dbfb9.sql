-- WhatsApp notification preferences per user
CREATE TABLE public.whatsapp_notification_prefs (
  user_id UUID NOT NULL PRIMARY KEY,
  market_resolution BOOLEAN NOT NULL DEFAULT true,
  market_cancelled BOOLEAN NOT NULL DEFAULT true,
  new_follower BOOLEAN NOT NULL DEFAULT true,
  copy_trade BOOLEAN NOT NULL DEFAULT true,
  payout BOOLEAN NOT NULL DEFAULT true,
  referral BOOLEAN NOT NULL DEFAULT true,
  price_alert BOOLEAN NOT NULL DEFAULT true,
  sports_score BOOLEAN NOT NULL DEFAULT true,
  general BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own wa prefs"
ON public.whatsapp_notification_prefs
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wa prefs"
ON public.whatsapp_notification_prefs
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wa prefs"
ON public.whatsapp_notification_prefs
FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all wa prefs"
ON public.whatsapp_notification_prefs
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));