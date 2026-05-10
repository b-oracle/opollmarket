-- Helper: delete resolved $0-volume crypto rounds + their round metadata.
-- Only deletes markets with zero participants AND zero volume to be safe.
CREATE OR REPLACE FUNCTION public.purge_empty_crypto_rounds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  deleted_count integer := 0;
  victim_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO victim_ids
  FROM public.markets
  WHERE is_crypto_round = true
    AND status = 'resolved'
    AND COALESCE(volume, 0) = 0
    AND COALESCE(participants, 0) = 0;

  IF victim_ids IS NULL OR array_length(victim_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- Wipe round metadata first (FK to markets is ON DELETE SET NULL/CASCADE varies)
  DELETE FROM public.crypto_round_meta WHERE market_id = ANY(victim_ids);

  DELETE FROM public.markets WHERE id = ANY(victim_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_empty_crypto_rounds() FROM PUBLIC, anon, authenticated;

-- One-time cleanup of historical $0-volume resolved rounds
SELECT public.purge_empty_crypto_rounds();

-- Hourly cron to keep the table clean going forward
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-empty-crypto-rounds')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-empty-crypto-rounds');

    PERFORM cron.schedule(
      'purge-empty-crypto-rounds',
      '7 * * * *',
      $cron$ SELECT public.purge_empty_crypto_rounds(); $cron$
    );
  END IF;
END $$;