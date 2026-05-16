-- 1) Repair legacy negative balances (clamp to 0) and log the cleanup.
WITH fixed AS (
  UPDATE public.balances
  SET amount            = GREATEST(amount, 0),
      bonus_balance     = GREATEST(bonus_balance, 0),
      insurance_balance = GREATEST(insurance_balance, 0),
      gift_balance      = GREATEST(gift_balance, 0),
      rewards_balance   = GREATEST(rewards_balance, 0),
      updated_at        = now()
  WHERE amount < 0 OR bonus_balance < 0 OR insurance_balance < 0
     OR gift_balance < 0 OR rewards_balance < 0
  RETURNING user_id, amount, bonus_balance, insurance_balance, gift_balance, rewards_balance
)
INSERT INTO public.system_alerts(severity, source, code, message, details)
SELECT 'warning', 'migration:non_negative_balances', 'legacy_negative_balance_clamped',
       'Legacy negative balance was clamped to zero before adding non-negative constraints.',
       to_jsonb(fixed)
FROM fixed;

-- 2) Hard CHECK constraints on every balance column.
ALTER TABLE public.balances
  DROP CONSTRAINT IF EXISTS balances_amount_nonneg,
  DROP CONSTRAINT IF EXISTS balances_bonus_nonneg,
  DROP CONSTRAINT IF EXISTS balances_insurance_nonneg,
  DROP CONSTRAINT IF EXISTS balances_gift_nonneg,
  DROP CONSTRAINT IF EXISTS balances_rewards_nonneg;

ALTER TABLE public.balances
  ADD CONSTRAINT balances_amount_nonneg    CHECK (amount            >= 0),
  ADD CONSTRAINT balances_bonus_nonneg     CHECK (bonus_balance     >= 0),
  ADD CONSTRAINT balances_insurance_nonneg CHECK (insurance_balance >= 0),
  ADD CONSTRAINT balances_gift_nonneg      CHECK (gift_balance      >= 0),
  ADD CONSTRAINT balances_rewards_nonneg   CHECK (rewards_balance   >= 0);

-- 3) Defense-in-depth BEFORE trigger with descriptive errors.
CREATE OR REPLACE FUNCTION public.enforce_balance_non_negative()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.amount < 0 THEN
    RAISE EXCEPTION 'balances.amount cannot go negative (attempted % for user %)',
      NEW.amount, NEW.user_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.bonus_balance < 0 THEN
    RAISE EXCEPTION 'balances.bonus_balance cannot go negative (attempted % for user %)',
      NEW.bonus_balance, NEW.user_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.insurance_balance < 0 THEN
    RAISE EXCEPTION 'balances.insurance_balance cannot go negative (attempted % for user %)',
      NEW.insurance_balance, NEW.user_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.gift_balance < 0 THEN
    RAISE EXCEPTION 'balances.gift_balance cannot go negative (attempted % for user %)',
      NEW.gift_balance, NEW.user_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.rewards_balance < 0 THEN
    RAISE EXCEPTION 'balances.rewards_balance cannot go negative (attempted % for user %)',
      NEW.rewards_balance, NEW.user_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_balances_non_negative ON public.balances;
CREATE TRIGGER trg_balances_non_negative
BEFORE INSERT OR UPDATE ON public.balances
FOR EACH ROW EXECUTE FUNCTION public.enforce_balance_non_negative();

-- 4) Fix adjust_balance_logged: prior version used severity='error' which violates
--    system_alerts_severity_check (allowed: info | warning | critical).
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

    INSERT INTO public.balance_ledger(
      correlation_id, user_id, actor_id, source, reason, success, error_message,
      delta_main, delta_bonus, delta_insurance
    ) VALUES (
      _corr, _user_id, _actor_id, COALESCE(_source,'unknown'), _reason, false, left(_err_msg, 500),
      _delta, _bonus_delta, _insurance_delta
    );

    INSERT INTO public.system_alerts(severity, source, code, message, details)
    VALUES (
      'critical',
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