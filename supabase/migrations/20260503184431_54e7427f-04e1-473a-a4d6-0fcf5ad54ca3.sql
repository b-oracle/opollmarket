-- Add lifecycle columns to space_bans so expired bans are preserved as history
ALTER TABLE public.space_bans 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_space_bans_active ON public.space_bans(space_id, user_id) WHERE is_active = true;

-- Replace UNIQUE (space_id, user_id) so a user can have a fresh ban after a previous one expires
ALTER TABLE public.space_bans DROP CONSTRAINT IF EXISTS space_bans_space_id_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_space_bans_active 
  ON public.space_bans(space_id, user_id) 
  WHERE is_active = true;

-- Cleanup function: marks expired bans inactive and notifies users
CREATE OR REPLACE FUNCTION public.expire_space_bans()
RETURNS TABLE(expired_count INTEGER) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    UPDATE public.space_bans b
    SET is_active = false,
        expired_at = now()
    WHERE b.is_active = true
      AND b.expires_at IS NOT NULL
      AND b.expires_at <= now()
    RETURNING b.id, b.user_id, b.space_id
  LOOP
    v_count := v_count + 1;
    -- Notify the user that their ban has expired
    BEGIN
      INSERT INTO public.notifications (user_id, actor_id, title, message, type)
      SELECT 
        r.user_id, 
        NULL,
        'Your Space ban has expired ✅',
        'You can now rejoin "' || COALESCE(s.title, 'the Space') || '".',
        'space_unbanned'
      FROM public.spaces s WHERE s.id = r.space_id;
    EXCEPTION WHEN OTHERS THEN
      -- non-blocking
      NULL;
    END;
  END LOOP;
  RETURN QUERY SELECT v_count;
END;
$$;

-- Schedule cleanup every 5 minutes via pg_cron (calls DB function directly, no HTTP)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('expire-space-bans') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-space-bans');

SELECT cron.schedule(
  'expire-space-bans',
  '*/5 * * * *',
  $cron$ SELECT public.expire_space_bans(); $cron$
);