-- ====================================================================
-- Balance audit ledger with correlation IDs + failure alerting
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.balance_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text,
  user_id uuid NOT NULL,
  actor_id uuid,
  source text,                 -- e.g. 'payaza-webhook', 'resolve-market'
  reason text,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  -- deltas applied in this op
  delta_main numeric NOT NULL DEFAULT 0,
  delta_bonus numeric NOT NULL DEFAULT 0,
  delta_insurance numeric NOT NULL DEFAULT 0,
  delta_gift numeric NOT NULL DEFAULT 0,
  delta_rewards numeric NOT NULL DEFAULT 0,
  -- before/after snapshots (main only required; others nullable)
  before_main numeric,
  after_main numeric,
  before_bonus numeric,
  after_bonus numeric,
  before_insurance numeric,
  after_insurance numeric,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_correlation ON public.balance_ledger(correlation_id);
CREATE INDEX IF NOT EXISTS idx_balance_ledger_user_created ON public.balance_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_ledger_failures ON public.balance_ledger(created_at DESC) WHERE success = false;
CREATE INDEX IF NOT EXISTS idx_balance_ledger_source_created ON public.balance_ledger(source, created_at DESC);

ALTER TABLE public.balance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view balance ledger" ON public.balance_ledger;
CREATE POLICY "Admins can view balance ledger" ON public.balance_ledger
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER paths can write.

-- ── Session-GUC helpers (caller sets these before mutating balances) ──
-- GUCs used: app.balance_correlation_id, app.balance_source, app.balance_reason, app.balance_actor

CREATE OR REPLACE FUNCTION public._current_guc(_key text, _default text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE v text;
BEGIN
  BEGIN
    v := current_setting(_key, true);
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;
  IF v IS NULL OR v = '' THEN RETURN _default; END IF;
  RETURN v;
END;
$$;

-- ── Trigger: auto-log every successful balance mutation ──
CREATE OR REPLACE FUNCTION public.log_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _corr text;
  _src  text;
  _reason text;
  _actor uuid;
  _b_main numeric; _a_main numeric;
  _b_bonus numeric; _a_bonus numeric;
  _b_ins numeric; _a_ins numeric;
  _b_gift numeric; _a_gift numeric;
  _b_rew numeric; _a_rew numeric;
BEGIN
  _corr := public._current_guc('app.balance_correlation_id');
  _src  := public._current_guc('app.balance_source', 'unknown');
  _reason := public._current_guc('app.balance_reason');
  BEGIN
    _actor := nullif(public._current_guc('app.balance_actor'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN _actor := auth.uid();
  END;
  IF _actor IS NULL THEN _actor := auth.uid(); END IF;

  IF TG_OP = 'INSERT' THEN
    _b_main := 0; _a_main := NEW.amount;
    _b_bonus := 0; _a_bonus := NEW.bonus_balance;
    _b_ins := 0;  _a_ins  := NEW.insurance_balance;
    _b_gift := 0; _a_gift := NEW.gift_balance;
    _b_rew := 0;  _a_rew  := NEW.rewards_balance;
  ELSE
    _b_main := OLD.amount; _a_main := NEW.amount;
    _b_bonus := OLD.bonus_balance; _a_bonus := NEW.bonus_balance;
    _b_ins := OLD.insurance_balance; _a_ins := NEW.insurance_balance;
    _b_gift := OLD.gift_balance; _a_gift := NEW.gift_balance;
    _b_rew := OLD.rewards_balance; _a_rew := NEW.rewards_balance;
    -- Skip pure no-op timestamp updates
    IF _a_main = _b_main AND _a_bonus = _b_bonus AND _a_ins = _b_ins
       AND _a_gift = _b_gift AND _a_rew = _b_rew THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.balance_ledger(
    correlation_id, user_id, actor_id, source, reason, success,
    delta_main, delta_bonus, delta_insurance, delta_gift, delta_rewards,
    before_main, after_main, before_bonus, after_bonus, before_insurance, after_insurance
  ) VALUES (
    _corr, NEW.user_id, _actor, _src, _reason, true,
    _a_main - _b_main, _a_bonus - _b_bonus, _a_ins - _b_ins, _a_gift - _b_gift, _a_rew - _b_rew,
    _b_main, _a_main, _b_bonus, _a_bonus, _b_ins, _a_ins
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_balance_change ON public.balances;
CREATE TRIGGER trg_log_balance_change
AFTER INSERT OR UPDATE ON public.balances
FOR EACH ROW EXECUTE FUNCTION public.log_balance_change();

-- ── Wrapper RPC: sets correlation context, calls adjust_balance, logs failures + alerts ──
CREATE OR REPLACE FUNCTION public.adjust_balance_logged(
  _user_id uuid,
  _delta numeric,
  _bonus_delta numeric DEFAULT 0,
  _insurance_delta numeric DEFAULT 0,
  _correlation_id text DEFAULT NULL,
  _source text DEFAULT 'unknown',
  _reason text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _corr text := COALESCE(_correlation_id, gen_random_uuid()::text);
  _err_msg text;
  _err_state text;
BEGIN
  -- Stamp session GUCs so the AFTER trigger picks them up
  PERFORM set_config('app.balance_correlation_id', _corr, true);
  PERFORM set_config('app.balance_source', COALESCE(_source, 'unknown'), true);
  PERFORM set_config('app.balance_reason', COALESCE(_reason, ''), true);
  PERFORM set_config('app.balance_actor', COALESCE(_actor_id::text, ''), true);

  BEGIN
    PERFORM public.adjust_balance(_user_id, _delta, _bonus_delta, _insurance_delta);
    RETURN jsonb_build_object('success', true, 'correlation_id', _corr);
  EXCEPTION WHEN OTHERS THEN
    _err_msg := SQLERRM;
    _err_state := SQLSTATE;

    -- Persist a failed ledger row (separate transaction-safe path)
    INSERT INTO public.balance_ledger(
      correlation_id, user_id, actor_id, source, reason, success, error_message,
      delta_main, delta_bonus, delta_insurance
    ) VALUES (
      _corr, _user_id, _actor_id, COALESCE(_source,'unknown'), _reason, false, left(_err_msg, 500),
      _delta, _bonus_delta, _insurance_delta
    );

    -- Raise a system alert for ops visibility
    INSERT INTO public.system_alerts(severity, source, code, message, details)
    VALUES (
      'error',
      COALESCE(_source, 'adjust_balance_logged'),
      'balance_adjust_failed',
      left('Balance adjust failed: ' || _err_msg, 500),
      jsonb_build_object(
        'correlation_id', _corr,
        'user_id', _user_id,
        'delta_main', _delta,
        'delta_bonus', _bonus_delta,
        'delta_insurance', _insurance_delta,
        'sqlstate', _err_state,
        'reason', _reason
      )
    );

    RETURN jsonb_build_object('success', false, 'error', _err_msg, 'correlation_id', _corr, 'sqlstate', _err_state);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_balance_logged(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_balance_logged(uuid,numeric,numeric,numeric,text,text,text,uuid) TO service_role;