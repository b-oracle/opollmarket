
CREATE OR REPLACE FUNCTION public.send_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _url text;
  _service_key text;
  _market_url text;
BEGIN
  _url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  IF _url IS NULL OR _service_key IS NULL THEN
    SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  END IF;

  IF _url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  _market_url := CASE WHEN NEW.market_id IS NOT NULL THEN '/market/' || NEW.market_id ELSE '/' END;

  -- Send web push notification
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

  -- Send Telegram notification
  PERFORM extensions.http_post(
    url := _url || '/functions/v1/telegram-notify',
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'market_id', NEW.market_id
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    )::jsonb
  );

  RETURN NEW;
END;
$function$;
