
CREATE OR REPLACE FUNCTION public.notify_twitter_market_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    PERFORM net.http_post(
      url := 'https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/twitter-auto-post',
      body := jsonb_build_object(
        'event_type', 'market_created',
        'variables', jsonb_build_object(
          'title', NEW.title,
          'market_id', NEW.id
        )
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdGp1aHFuZG5jYW5md2dqd3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Mzg3NDUsImV4cCI6MjA4ODExNDc0NX0.0qcvJUjAGlKATXxBPSvjVD_Q9LUROkrDD-mk9f25Ygo'
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'twitter auto-post market trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

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

    PERFORM net.http_post(
      url := 'https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/twitter-auto-post',
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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdGp1aHFuZG5jYW5md2dqd3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Mzg3NDUsImV4cCI6MjA4ODExNDc0NX0.0qcvJUjAGlKATXxBPSvjVD_Q9LUROkrDD-mk9f25Ygo'
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'twitter auto-post space trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
