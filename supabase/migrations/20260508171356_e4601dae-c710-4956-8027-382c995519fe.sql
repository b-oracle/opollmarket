-- Speed up crypto Up/Down resolution by running the auto-resolve and round-spawner
-- cron jobs every 15 seconds instead of every minute. Cuts the worst-case
-- post-deadline wait from ~60s down to ~15s.
DO $$
BEGIN
  -- Drop existing schedules if present (ignore errors if they don't exist)
  BEGIN PERFORM cron.unschedule('check-auto-resolve'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('crypto-round-spawner'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('check-auto-resolve-15s'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('crypto-round-spawner-15s'); EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

SELECT cron.schedule(
  'check-auto-resolve-15s',
  '15 seconds',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-auto-resolve',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'crypto-round-spawner-15s',
  '15 seconds',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/crypto-round-spawner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);