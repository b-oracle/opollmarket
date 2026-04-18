SELECT cron.unschedule('check-sports-resolve-markets');

SELECT cron.schedule(
  'check-sports-resolve-markets',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/check-sports-resolve',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdGp1aHFuZG5jYW5md2dqd3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Mzg3NDUsImV4cCI6MjA4ODExNDc0NX0.0qcvJUjAGlKATXxBPSvjVD_Q9LUROkrDD-mk9f25Ygo"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);