
-- Enable pg_net if not already
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to auto-post new markets
CREATE OR REPLACE FUNCTION public.notify_twitter_market_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    PERFORM extensions.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/twitter-auto-post',
      body := jsonb_build_object(
        'event_type', 'market_created',
        'variables', jsonb_build_object(
          'title', NEW.title,
          'market_id', NEW.id
        )
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'twitter auto-post market trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Function to auto-post spaces going live  
CREATE OR REPLACE FUNCTION public.notify_twitter_space_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_name text;
BEGIN
  IF NEW.status = 'live' AND (OLD.status IS NULL OR OLD.status != 'live') THEN
    SELECT COALESCE(display_name, 'Someone') INTO _host_name
    FROM public.profiles WHERE id = NEW.host_id;

    PERFORM extensions.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/twitter-auto-post',
      body := jsonb_build_object(
        'event_type', 'space_started',
        'variables', jsonb_build_object(
          'title', NEW.title,
          'space_id', NEW.id::text,
          'host_name', _host_name
        )
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'twitter auto-post space trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_twitter_auto_post_market
  AFTER UPDATE ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_twitter_market_created();

CREATE TRIGGER trg_twitter_auto_post_space
  AFTER UPDATE ON public.spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_twitter_space_started();
