
CREATE TABLE public.sports_import_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_type text NOT NULL DEFAULT 'football',
  league_id integer NOT NULL,
  league_name text NOT NULL,
  league_logo text,
  country text,
  max_imports_per_run integer NOT NULL DEFAULT 10,
  max_days_ahead integer NOT NULL DEFAULT 14,
  auto_approve boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sports_import_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sports import presets"
ON public.sports_import_presets
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE UNIQUE INDEX idx_sports_import_presets_league ON public.sports_import_presets (sport_type, league_id);
