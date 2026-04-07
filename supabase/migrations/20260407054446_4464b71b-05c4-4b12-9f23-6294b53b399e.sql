
CREATE TABLE public.admin_notification_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  target_type text NOT NULL DEFAULT 'all_users',
  target_filter jsonb DEFAULT '{}'::jsonb,
  send_push boolean NOT NULL DEFAULT false,
  scheduled_at timestamptz NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz NULL,
  recipients_count integer DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notification_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage broadcasts"
  ON public.admin_notification_broadcasts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
