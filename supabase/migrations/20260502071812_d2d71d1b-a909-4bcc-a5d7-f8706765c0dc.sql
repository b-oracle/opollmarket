-- Reactivate NYXLY's market and extend the end date so it has a proper window
UPDATE public.markets
SET status = 'active',
    end_date = (CURRENT_DATE + INTERVAL '7 days')::date,
    updated_at = now()
WHERE id = '30004722-0d33-4823-a2d5-c6bfb117c6ec'
  AND status = 'ended';

-- Notify the creator that their market has been reactivated
INSERT INTO public.notifications (user_id, title, message, type, market_id)
SELECT creator_wallet::uuid,
       'Market Reactivated ✅',
       'Your market "' || title || '" has been reactivated and the resolution date extended. Predictions are open again.',
       'info',
       id
FROM public.markets
WHERE id = '30004722-0d33-4823-a2d5-c6bfb117c6ec';

-- Enforce minimum 3-day market window at the database level (creation only).
-- Sports auto-resolve markets are exempt because they use kickoff time.
CREATE OR REPLACE FUNCTION public.enforce_min_market_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only enforce on INSERT, and skip sports auto-resolve markets
  IF TG_OP = 'INSERT'
     AND NEW.end_date IS NOT NULL
     AND NOT (COALESCE(NEW.auto_resolve, false) AND NEW.sport_match_id IS NOT NULL)
     AND NEW.end_date < (CURRENT_DATE + INTERVAL '3 days')::date
  THEN
    RAISE EXCEPTION 'Market resolution date must be at least 3 days from today (got %)', NEW.end_date
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_min_market_duration_trg ON public.markets;
CREATE TRIGGER enforce_min_market_duration_trg
  BEFORE INSERT ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_min_market_duration();