CREATE TABLE IF NOT EXISTS public.admin_action_idempotency (
  idempotency_key TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL,
  target_id UUID,
  request_hash TEXT,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (action, idempotency_key)
);

ALTER TABLE public.admin_action_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view idempotency keys"
ON public.admin_action_idempotency
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_admin_idem_actor_created
  ON public.admin_action_idempotency (actor_id, created_at DESC);