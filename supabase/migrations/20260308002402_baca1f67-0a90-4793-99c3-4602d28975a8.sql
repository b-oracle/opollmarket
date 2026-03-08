
-- 1. Create polymarket_presets table
CREATE TABLE public.polymarket_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  max_days_ahead integer NOT NULL DEFAULT 14,
  enabled boolean NOT NULL DEFAULT true,
  auto_approve boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.polymarket_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage presets" ON public.polymarket_presets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can read presets" ON public.polymarket_presets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Add polymarket columns to markets table
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS polymarket_id text,
  ADD COLUMN IF NOT EXISTS polymarket_event_slug text;

-- Create unique index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_polymarket_id ON public.markets (polymarket_id) WHERE polymarket_id IS NOT NULL;
