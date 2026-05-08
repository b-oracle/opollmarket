CREATE TABLE public.payaza_manual_credit_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  transaction_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  credited_by UUID NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payaza_manual_credit_refs_tx ON public.payaza_manual_credit_refs(transaction_id);
CREATE INDEX idx_payaza_manual_credit_refs_user ON public.payaza_manual_credit_refs(user_id);

ALTER TABLE public.payaza_manual_credit_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view manual credits"
  ON public.payaza_manual_credit_refs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert manual credits"
  ON public.payaza_manual_credit_refs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));