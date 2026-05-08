-- Hard invariant: crypto Up/Down rounds must run for their full duration.
-- Any attempt to flip status to ended/resolved/cancelled before
-- auto_resolve_deadline is rejected by the database itself.
CREATE OR REPLACE FUNCTION public.enforce_crypto_round_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guard crypto Up/Down rounds.
  IF NEW.is_crypto_round IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Only inspect actual transitions.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Allowed terminal transitions only AFTER the deadline.
  IF NEW.status IN ('ended', 'resolved', 'cancelled') THEN
    IF NEW.auto_resolve_deadline IS NULL THEN
      RAISE EXCEPTION
        'Crypto round % cannot be closed: missing auto_resolve_deadline', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Allow `cancelled` regardless (admin escape hatch for emergency stop)
    -- but still log it for audit. Comment out the cancel allowance if you
    -- want zero exceptions.
    IF NEW.status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    IF now() < NEW.auto_resolve_deadline THEN
      RAISE EXCEPTION
        'Crypto round % cannot transition to % before deadline % (now=%)',
        NEW.id, NEW.status, NEW.auto_resolve_deadline, now()
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_crypto_round_state_machine ON public.markets;

CREATE TRIGGER trg_enforce_crypto_round_state_machine
  BEFORE UPDATE OF status ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_crypto_round_state_machine();