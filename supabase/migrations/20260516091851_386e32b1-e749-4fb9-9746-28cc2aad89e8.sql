
-- ============ bsc_deposit_addresses ============
CREATE TABLE public.bsc_deposit_addresses (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hd_index integer NOT NULL UNIQUE,
  address text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bsc_deposit_addresses_address_lower ON public.bsc_deposit_addresses (lower(address));

ALTER TABLE public.bsc_deposit_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own deposit address"
  ON public.bsc_deposit_addresses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============ bsc_deposit_events ============
CREATE TABLE public.bsc_deposit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address text NOT NULL,
  token text NOT NULL, -- 'USDT' | 'USDC'
  token_contract text NOT NULL,
  from_address text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  amount_wei numeric(78,0) NOT NULL,
  amount_usd numeric(20,6) NOT NULL,
  confirmations integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'detected', -- detected | credited | orphaned
  credited_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  credited_at timestamptz,
  CONSTRAINT bsc_deposit_events_uniq UNIQUE (tx_hash, log_index)
);
CREATE INDEX idx_bsc_deposit_events_user ON public.bsc_deposit_events (user_id, detected_at DESC);
CREATE INDEX idx_bsc_deposit_events_status ON public.bsc_deposit_events (status) WHERE status = 'detected';

ALTER TABLE public.bsc_deposit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own deposit events"
  ON public.bsc_deposit_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all deposit events"
  ON public.bsc_deposit_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============ bsc_deposit_state (singleton) ============
CREATE TABLE public.bsc_deposit_state (
  id integer PRIMARY KEY CHECK (id = 1),
  last_scanned_block bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bsc_deposit_state ENABLE ROW LEVEL SECURITY;
-- no policies → only service role can touch it

-- ============ RPC: allocate / fetch deposit address ============
-- The edge function passes the user_id (taken from authenticated JWT) AND the
-- derived address (computed from the master seed using hd_index). Postgres
-- atomically picks the next hd_index inside a transaction to avoid collisions.
CREATE OR REPLACE FUNCTION public.allocate_bsc_deposit_index(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_index integer;
  next_index integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  SELECT hd_index INTO existing_index
  FROM public.bsc_deposit_addresses
  WHERE user_id = _user_id;

  IF existing_index IS NOT NULL THEN
    RETURN existing_index;
  END IF;

  -- Lock to serialize index allocation across concurrent callers
  PERFORM pg_advisory_xact_lock(hashtext('bsc_deposit_addresses_alloc'));

  SELECT COALESCE(MAX(hd_index), -1) + 1 INTO next_index
  FROM public.bsc_deposit_addresses;

  RETURN next_index;
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_bsc_deposit_index(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_bsc_deposit_address(
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

  -- Idempotent: if a row already exists for this user, return it
  SELECT * INTO row FROM public.bsc_deposit_addresses WHERE user_id = _user_id;
  IF FOUND THEN RETURN row; END IF;

  INSERT INTO public.bsc_deposit_addresses (user_id, hd_index, address)
  VALUES (_user_id, _hd_index, _address)
  RETURNING * INTO row;
  RETURN row;
END;
$$;
REVOKE ALL ON FUNCTION public.register_bsc_deposit_address(uuid, integer, text) FROM PUBLIC, anon, authenticated;

-- ============ RPC: credit a confirmed deposit ============
CREATE OR REPLACE FUNCTION public.credit_bsc_deposit(_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev public.bsc_deposit_events%ROWTYPE;
  new_tx_id uuid;
BEGIN
  -- Lock the event row to prevent double-credit
  SELECT * INTO ev FROM public.bsc_deposit_events
  WHERE id = _event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % not found', _event_id;
  END IF;

  IF ev.status = 'credited' THEN
    RETURN ev.credited_tx_id; -- already credited, idempotent
  END IF;

  IF ev.status <> 'detected' THEN
    RAISE EXCEPTION 'event % is in status % and cannot be credited', _event_id, ev.status;
  END IF;

  -- Insert deposit transaction
  INSERT INTO public.transactions (
    user_id, type, amount, status, payment_provider,
    nowpayments_payment_id, tx_hash,
    gross_amount_usd, net_amount_usd, description
  ) VALUES (
    ev.user_id, 'deposit', ev.amount_usd, 'confirmed', 'bsc_native',
    ev.tx_hash || ':' || ev.log_index::text, ev.tx_hash,
    ev.amount_usd, ev.amount_usd,
    'Native BSC ' || ev.token || ' deposit'
  )
  RETURNING id INTO new_tx_id;

  -- Credit balance using existing helper
  PERFORM public.adjust_balance(ev.user_id, ev.amount_usd, 0::numeric, 0::numeric);

  UPDATE public.bsc_deposit_events
  SET status = 'credited',
      credited_tx_id = new_tx_id,
      credited_at = now()
  WHERE id = _event_id;

  -- Notify user
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    ev.user_id,
    'Deposit Confirmed ✅',
    'Your deposit of $' || to_char(ev.amount_usd, 'FM999990.00') || ' (' || ev.token || ' on BSC) has been credited.',
    'deposit'
  );

  RETURN new_tx_id;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_bsc_deposit(uuid) FROM PUBLIC, anon, authenticated;

-- Realtime for user-facing event updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bsc_deposit_events;
