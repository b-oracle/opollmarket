
CREATE OR REPLACE FUNCTION public.set_updated_at_market_events()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  image_url text,
  category text,
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  volume numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.market_event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.market_events(id) ON DELETE CASCADE,
  market_id uuid NOT NULL UNIQUE REFERENCES public.markets(id) ON DELETE CASCADE,
  display_label text,
  icon_url text,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_market_event_members_event_id ON public.market_event_members(event_id);

GRANT SELECT ON public.market_events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.market_events TO authenticated;
GRANT ALL ON public.market_events TO service_role;

GRANT SELECT ON public.market_event_members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.market_event_members TO authenticated;
GRANT ALL ON public.market_event_members TO service_role;

ALTER TABLE public.market_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_event_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are public" ON public.market_events
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage events" ON public.market_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Event members are public" ON public.market_event_members
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage event members" ON public.market_event_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

CREATE TRIGGER market_events_updated_at
  BEFORE UPDATE ON public.market_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_market_events();
