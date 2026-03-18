
-- Affiliate tracking: add api_key_id to transactions for tracking which API key sourced the bet
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL;

-- Affiliate earnings table
CREATE TABLE public.affiliate_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE CASCADE NOT NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
  bet_amount numeric NOT NULL,
  fee_amount numeric NOT NULL,
  commission_percent numeric NOT NULL DEFAULT 5,
  commission_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage affiliate_earnings"
  ON public.affiliate_earnings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- White-label: add branding settings to api_keys
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS brand_name text;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS brand_logo_url text;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS brand_primary_color text DEFAULT '#3b82f6';
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS brand_dark_bg text DEFAULT '#0a0a0f';
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS affiliate_commission_percent numeric NOT NULL DEFAULT 5;

-- Webhook event logs
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response_code integer,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook_events"
  ON public.webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_webhook_events_status ON public.webhook_events (status, created_at);
