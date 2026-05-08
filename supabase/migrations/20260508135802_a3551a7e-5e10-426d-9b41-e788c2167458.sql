CREATE OR REPLACE FUNCTION public.enforce_min_market_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.end_date IS NOT NULL
     AND NEW.category = 'Sports'
     AND COALESCE(NEW.is_crypto_round, false) = false
     AND NOT (COALESCE(NEW.auto_resolve, false) AND NEW.sport_match_id IS NOT NULL)
     AND NEW.end_date < (CURRENT_DATE + INTERVAL '3 days')::date
  THEN
    RAISE EXCEPTION 'Sports market resolution date must be at least 3 days from today (got %)', NEW.end_date
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;