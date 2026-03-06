
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function to send push notification on every notification insert
CREATE OR REPLACE FUNCTION public.send_push_on_notification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _url text;
  _service_key text;
  _market_url text;
BEGIN
  _url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  IF _url IS NULL OR _service_key IS NULL THEN
    -- Fallback: read from vault if app settings not available
    SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  END IF;

  IF _url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  _market_url := CASE WHEN NEW.market_id IS NOT NULL THEN '/market/' || NEW.market_id ELSE '/' END;

  PERFORM extensions.http_post(
    url := _url || '/functions/v1/send-push',
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'url', _market_url
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    )::jsonb
  );

  RETURN NEW;
END;
$$;

-- Attach trigger to notifications table
CREATE TRIGGER trg_send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_on_notification();
