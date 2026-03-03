
CREATE TABLE public.commission_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_fee_percent numeric NOT NULL DEFAULT 2,
  creator_fee_percent numeric NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read commission settings"
ON public.commission_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can update commission settings"
ON public.commission_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.commission_settings (admin_fee_percent, creator_fee_percent) VALUES (2, 3);
