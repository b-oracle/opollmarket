
-- Add optional review_reason column for context on manual_review/rejected events
ALTER TABLE public.bsc_deposit_events
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_reject_bsc_deposit(_event_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev public.bsc_deposit_events%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT * INTO ev FROM public.bsc_deposit_events
  WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF ev.status = 'credited' THEN
    RAISE EXCEPTION 'event % already credited; cannot reject', _event_id;
  END IF;

  UPDATE public.bsc_deposit_events
  SET status = 'rejected',
      review_reason = COALESCE(_reason, 'rejected by admin'),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = _event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reject_bsc_deposit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_bsc_deposit(uuid, text) TO authenticated;

-- Track reviewer on approval too
CREATE OR REPLACE FUNCTION public.admin_approve_bsc_deposit(_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev public.bsc_deposit_events%ROWTYPE;
  new_tx_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT * INTO ev FROM public.bsc_deposit_events
  WHERE id = _event_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % not found', _event_id; END IF;
  IF ev.status = 'credited' THEN RETURN ev.credited_tx_id; END IF;
  IF ev.status NOT IN ('manual_review') THEN
    RAISE EXCEPTION 'event % is %, expected manual_review', _event_id, ev.status;
  END IF;

  INSERT INTO public.transactions (
    user_id, type, amount, status, payment_provider,
    nowpayments_payment_id, tx_hash,
    gross_amount_usd, net_amount_usd, description
  ) VALUES (
    ev.user_id, 'deposit', ev.amount_usd, 'confirmed', 'bsc_native',
    ev.tx_hash || ':' || ev.log_index::text, ev.tx_hash,
    ev.amount_usd, ev.amount_usd,
    'Native BSC ' || ev.token || ' deposit (admin-approved)'
  )
  RETURNING id INTO new_tx_id;

  PERFORM public.adjust_balance(ev.user_id, ev.amount_usd, 0::numeric, 0::numeric);

  UPDATE public.bsc_deposit_events
  SET status = 'credited',
      credited_tx_id = new_tx_id,
      credited_at = now(),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = _event_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (ev.user_id, 'Deposit Confirmed ✅',
    'Your deposit of $' || to_char(ev.amount_usd, 'FM999990.00') || ' (' || ev.token || ' on BSC) has been credited after review.',
    'deposit');

  RETURN new_tx_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_approve_bsc_deposit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_bsc_deposit(uuid) TO authenticated;
