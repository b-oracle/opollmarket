
CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  token_id uuid,
  token_tail text,
  title text,
  body text,
  is_call boolean NOT NULL DEFAULT false,
  call_id text,
  ok boolean NOT NULL,
  http_status integer,
  fcm_error_status text,
  fcm_error_code text,
  fcm_error_message text,
  hint text,
  removed boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_created_at
  ON public.push_delivery_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_user_id
  ON public.push_delivery_logs (user_id, created_at DESC);

ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read push delivery logs" ON public.push_delivery_logs;
CREATE POLICY "Admins can read push delivery logs"
  ON public.push_delivery_logs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );
