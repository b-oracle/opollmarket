
CREATE TABLE public.kyc_device_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_submission_id uuid REFERENCES public.kyc_submissions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  screen_width integer,
  screen_height integer,
  device_pixel_ratio numeric,
  platform text,
  language text,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_device_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read kyc device logs"
  ON public.kyc_device_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
