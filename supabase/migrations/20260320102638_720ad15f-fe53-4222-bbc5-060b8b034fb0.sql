
-- Create trigger function for auto-broadcasting market events via Aimtell
CREATE OR REPLACE FUNCTION public.aimtell_auto_broadcast_market()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _url text;
  _service_key text;
  _event_type text;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    _event_type := CASE 
      WHEN NEW.sport_type IS NOT NULL THEN 'new_sports_market'
      ELSE 'market_created'
    END;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    _event_type := 'market_resolved';
  ELSIF TG_OP = 'UPDATE' AND NEW.trending = true AND OLD.trending = false THEN
    _event_type := 'market_trending';
  ELSE
    RETURN NEW;
  END IF;

  -- Get credentials
  BEGIN
    SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  IF _url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire auto-broadcast edge function
  BEGIN
    PERFORM extensions.http_post(
      url := _url || '/functions/v1/aimtell-auto-broadcast',
      body := jsonb_build_object(
        'event_type', _event_type,
        'variables', jsonb_build_object(
          'title', NEW.title,
          'market_id', NEW.id::text,
          'resolved_side', COALESCE(NEW.resolved_side, '')
        )
      )::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_key
      )::jsonb
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'aimtell_auto_broadcast_market: failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Create the trigger on markets table
CREATE TRIGGER trg_aimtell_auto_broadcast_market
  AFTER INSERT OR UPDATE ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.aimtell_auto_broadcast_market();
