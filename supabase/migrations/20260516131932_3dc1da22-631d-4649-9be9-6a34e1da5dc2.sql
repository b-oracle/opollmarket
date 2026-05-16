-- =====================================================================
-- Security hardening pass (retry with correct column names)
-- =====================================================================

-- 1. profiles: revoke sensitive columns
REVOKE SELECT (email, date_of_birth, gender, location, kyc_status,
               wallet_address, is_blocked, blocked_at, block_reason, age,
               referred_by, twitter_id)
  ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE VIEW public.my_profile
WITH (security_invoker = true) AS
SELECT * FROM public.profiles WHERE id = auth.uid();
GRANT SELECT ON public.my_profile TO authenticated;

-- 2. space_messages: require participation to post
DROP POLICY IF EXISTS "Users can send space messages"               ON public.space_messages;
DROP POLICY IF EXISTS "Authenticated users can send space messages" ON public.space_messages;
DROP POLICY IF EXISTS "Users can insert space messages"             ON public.space_messages;
DROP POLICY IF EXISTS "Participants can send space messages"        ON public.space_messages;

CREATE POLICY "Participants can send space messages"
ON public.space_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.is_space_participant(space_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.id = space_id
        AND (s.host_id = auth.uid()
             OR auth.uid() = ANY(COALESCE(s.co_host_ids, ARRAY[]::uuid[])))
    )
  )
);

-- 3. market_broadcasts: hide payment PII (owner + admin only)
DROP POLICY IF EXISTS "Broadcasts readable by authenticated" ON public.market_broadcasts;
DROP POLICY IF EXISTS "Broadcasts readable by owner or admin" ON public.market_broadcasts;
CREATE POLICY "Broadcasts readable by owner or admin"
ON public.market_broadcasts
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);

-- 3b. market_boosts: owner (by wallet) + admin only; sanitized public view for UI
DROP POLICY IF EXISTS "Boosts readable by authenticated" ON public.market_boosts;
DROP POLICY IF EXISTS "Boosts readable by owner or admin" ON public.market_boosts;
CREATE POLICY "Boosts readable by owner or admin"
ON public.market_boosts
FOR SELECT
TO authenticated
USING (
  (auth.uid())::text = payer_wallet
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE OR REPLACE VIEW public.market_boosts_public
WITH (security_invoker = true) AS
SELECT id, market_id, tier, created_at, starts_at, ends_at, status
FROM public.market_boosts
WHERE status = 'active' OR ends_at > now();
GRANT SELECT ON public.market_boosts_public TO anon, authenticated;

-- 4. analytics_events: drop public page_view leak, add aggregated counter
DROP POLICY IF EXISTS "Anyone can count page views" ON public.analytics_events;

CREATE OR REPLACE FUNCTION public.get_page_view_count(_path text DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM public.analytics_events
  WHERE event_name = 'page_view'
    AND (_path IS NULL OR (properties->>'path') = _path);
$$;
REVOKE EXECUTE ON FUNCTION public.get_page_view_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_page_view_count(text) TO authenticated, anon;

-- 5. Service-role only deny-all for internal tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bsc_deposit_state') THEN
    DROP POLICY IF EXISTS "Service role only" ON public.bsc_deposit_state;
    CREATE POLICY "Service role only" ON public.bsc_deposit_state
      FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notification_email_claims') THEN
    DROP POLICY IF EXISTS "Service role only" ON public.notification_email_claims;
    CREATE POLICY "Service role only" ON public.notification_email_claims
      FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;
END $$;

-- 6. Lock down legacy adjust_balance from public roles
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'adjust_balance'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 7. search_path hardening for critical functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'adjust_balance','adjust_balance_logged','settle_user_debts',
        'has_role','is_space_participant','enforce_balance_non_negative',
        'get_page_view_count'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 8. Per-target admin credit cap helper
CREATE OR REPLACE FUNCTION public.check_admin_credit_target_cap(
  _target_id uuid,
  _amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used numeric := 0;
  cap  numeric := 25000;
BEGIN
  SELECT COALESCE(SUM((details->>'amount')::numeric), 0) INTO used
  FROM public.audit_logs
  WHERE action = 'admin_credit_deposit'
    AND target_id = _target_id
    AND created_at >= now() - interval '24 hours';

  IF used + _amount > cap THEN
    RETURN jsonb_build_object(
      'allowed', false, 'used', used, 'cap', cap,
      'reason', format('Per-target 24h cap exceeded (used $%s of $%s)', used, cap)
    );
  END IF;
  RETURN jsonb_build_object('allowed', true, 'used', used, 'cap', cap);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_admin_credit_target_cap(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_admin_credit_target_cap(uuid, numeric) TO service_role;
