CREATE TABLE public.promo_banners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('hero', 'featured')),
  title text NOT NULL,
  subtitle text,
  image_url text,
  cta_text text,
  target_type text NOT NULL CHECK (target_type IN ('market', 'event')),
  target_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_promo_banners_active ON public.promo_banners(kind, active, sort_order);

GRANT SELECT ON public.promo_banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.promo_banners TO authenticated;
GRANT ALL ON public.promo_banners TO service_role;

ALTER TABLE public.promo_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active banners are public"
  ON public.promo_banners FOR SELECT
  TO anon, authenticated
  USING (active = true AND (ends_at IS NULL OR ends_at > now()) AND starts_at <= now());

CREATE POLICY "Admins read all banners"
  ON public.promo_banners FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins manage banners"
  ON public.promo_banners FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.set_updated_at_promo_banners()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER promo_banners_updated_at
  BEFORE UPDATE ON public.promo_banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_promo_banners();