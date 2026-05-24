
-- 1. user_security_settings: revoke SELECT on secret columns from clients
REVOKE SELECT (totp_secret, pin_hash) ON public.user_security_settings FROM authenticated, anon;

-- 2. transactions: remove user-facing INSERT policy
DROP POLICY IF EXISTS "Users can insert own transactions safely" ON public.transactions;

-- Admin RPC to insert a transaction (used by AdminUsers balance adjust)
CREATE OR REPLACE FUNCTION public.admin_record_transaction(
  _user_id uuid,
  _type text,
  _amount numeric,
  _status text DEFAULT 'confirmed',
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _type NOT IN ('deposit','withdrawal','adjustment','bonus','refund') THEN
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;
  INSERT INTO public.transactions (user_id, type, amount, status, description)
  VALUES (_user_id, _type, _amount, _status, _description)
  RETURNING id INTO _tx_id;
  RETURN _tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_transaction(uuid, text, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_record_transaction(uuid, text, numeric, text, text) TO authenticated;

-- 3. bsc_deposit_events: hide internal review/reverification columns from clients
REVOKE SELECT (
  reviewed_by,
  last_reverified_at,
  last_reverify_status,
  last_reverify_details,
  reverify_count,
  rpc_error_count,
  tx_missing_count,
  tx_failed_count,
  next_reverify_at
) ON public.bsc_deposit_events FROM authenticated, anon;

-- 4. sport_score_cache: allow public read (used by realtime live score broadcasts)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid = 'public.sport_score_cache'::regclass
      AND polname = 'Public can read live scores'
  ) THEN
    CREATE POLICY "Public can read live scores" ON public.sport_score_cache
      FOR SELECT TO authenticated, anon USING (true);
  END IF;
END $$;

-- 5. realtime.messages: drop permissive policies so clients cannot subscribe to
--    arbitrary broadcast/presence topics. Server-side service_role bypasses RLS.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid = 'realtime.messages'::regclass LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON realtime.messages', p.polname);
  END LOOP;
END $$;
