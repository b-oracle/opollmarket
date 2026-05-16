
-- ============ Atomic slot reservation ============
-- Reserves the next hd_index for the user in a single transaction.
-- Returns (hd_index, address). If user already has a finalized address, returns it.
-- Otherwise inserts a placeholder row with address = 'pending:<user_id>' which the
-- caller must replace via finalize_bsc_deposit_address().
CREATE OR REPLACE FUNCTION public.reserve_bsc_deposit_slot(_user_id uuid)
RETURNS TABLE(hd_index integer, address text, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_idx integer;
  existing_addr text;
  next_idx integer;
  placeholder text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  SELECT a.hd_index, a.address INTO existing_idx, existing_addr
  FROM public.bsc_deposit_addresses a
  WHERE a.user_id = _user_id;

  IF FOUND THEN
    RETURN QUERY SELECT existing_idx, existing_addr, false;
    RETURN;
  END IF;

  -- Serialize concurrent allocators
  PERFORM pg_advisory_xact_lock(hashtext('bsc_deposit_addresses_alloc'));

  -- Re-check after lock
  SELECT a.hd_index, a.address INTO existing_idx, existing_addr
  FROM public.bsc_deposit_addresses a
  WHERE a.user_id = _user_id;
  IF FOUND THEN
    RETURN QUERY SELECT existing_idx, existing_addr, false;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(a.hd_index), -1) + 1 INTO next_idx
  FROM public.bsc_deposit_addresses a;

  placeholder := 'pending:' || _user_id::text;

  INSERT INTO public.bsc_deposit_addresses (user_id, hd_index, address)
  VALUES (_user_id, next_idx, placeholder);

  RETURN QUERY SELECT next_idx, placeholder, true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_bsc_deposit_slot(uuid) FROM PUBLIC, anon, authenticated;

-- Finalize the placeholder with the derived BEP20 address.
CREATE OR REPLACE FUNCTION public.finalize_bsc_deposit_address(
  _user_id uuid,
  _hd_index integer,
  _address text
)
RETURNS public.bsc_deposit_addresses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.bsc_deposit_addresses;
BEGIN
  IF _user_id IS NULL OR _hd_index IS NULL OR _address IS NULL THEN
    RAISE EXCEPTION 'all params required';
  END IF;
  IF _address !~* '^0x[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'invalid evm address: %', _address;
  END IF;

  UPDATE public.bsc_deposit_addresses
  SET address = lower(_address)
  WHERE user_id = _user_id
    AND hd_index = _hd_index
    AND address LIKE 'pending:%'
  RETURNING * INTO row;

  IF NOT FOUND THEN
    -- Either already finalized or slot doesn't match — return current row
    SELECT * INTO row FROM public.bsc_deposit_addresses WHERE user_id = _user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no reserved slot for user %', _user_id;
    END IF;
  END IF;

  RETURN row;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_bsc_deposit_address(uuid, integer, text) FROM PUBLIC, anon, authenticated;

-- ============ Admin approval for manual-review deposits ============
CREATE INDEX IF NOT EXISTS idx_bsc_deposit_events_review
  ON public.bsc_deposit_events (status) WHERE status = 'manual_review';

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
  IF ev.status <> 'manual_review' THEN
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
  SET status = 'credited', credited_tx_id = new_tx_id, credited_at = now()
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
