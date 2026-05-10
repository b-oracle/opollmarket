-- Purge existing noisy "skipped" audit rows and set up automatic retention.
DELETE FROM public.crypto_round_spawn_log
WHERE status = 'skipped';

-- Daily cleanup: remove any spawn-log rows older than 30 days.
-- (Spawned + error events are useful for debugging recent issues, but
-- multi-month retention isn't needed.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('crypto-round-spawn-log-retention')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'crypto-round-spawn-log-retention'
    );

    PERFORM cron.schedule(
      'crypto-round-spawn-log-retention',
      '0 3 * * *',
      $cron$
        DELETE FROM public.crypto_round_spawn_log
        WHERE created_at < now() - interval '30 days';
      $cron$
    );
  END IF;
END $$;