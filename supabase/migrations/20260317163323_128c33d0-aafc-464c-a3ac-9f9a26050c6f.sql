
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
  BEGIN
    _url := current_setting('app.settings.supabase_url', true);
    _service_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN others THEN
    _url := NULL;
    _service_key := NULL;
  END;

  IF _url IS NULL OR _url = '' THEN
    BEGIN
      SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    EXCEPTION WHEN others THEN
      _url := NULL;
    END;
  END IF;

  IF _service_key IS NULL OR _service_key = '' THEN
    BEGIN
      SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
    EXCEPTION WHEN others THEN
      _service_key := NULL;
    END;
  END IF;

  IF _url IS NULL OR _url = '' OR _service_key IS NULL OR _service_key = '' THEN
    RETURN NEW;
  END IF;

  _market_url := CASE WHEN NEW.market_id IS NOT NULL THEN '/market/' || NEW.market_id ELSE '/' END;

  -- Send web push notification
  BEGIN
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
  EXCEPTION WHEN others THEN
    RAISE WARNING 'send_push_on_notification: push failed for %: %', NEW.id, SQLERRM;
  END;

  -- Send Aimtell push notification
  BEGIN
    PERFORM extensions.http_post(
      url := _url || '/functions/v1/aimtell-push',
      body := jsonb_build_object(
        'title', NEW.title,
        'body', NEW.message,
        'url', 'https://opoll.org' || _market_url
      )::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_key
      )::jsonb
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'send_push_on_notification: aimtell failed for %: %', NEW.id, SQLERRM;
  END;

  -- Send Telegram notification
  BEGIN
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
  EXCEPTION WHEN others THEN
    RAISE WARNING 'send_push_on_notification: telegram failed for %: %', NEW.id, SQLERRM;
  END;

  -- Send WhatsApp notification
  BEGIN
    PERFORM extensions.http_post(
      url := _url || '/functions/v1/whatsapp-send',
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'title', NEW.title,
        'message', NEW.message,
        'market_id', NEW.market_id,
        'type', NEW.type
      )::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_key
      )::jsonb
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'send_push_on_notification: whatsapp failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
