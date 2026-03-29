
-- 1. Add peak_listeners column
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS peak_listeners INTEGER NOT NULL DEFAULT 0;

-- 2. Update trigger to track peak listeners
CREATE OR REPLACE FUNCTION public.update_space_listener_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_count integer;
  _space_id uuid;
BEGIN
  _space_id := COALESCE(NEW.space_id, OLD.space_id);

  SELECT COUNT(*) INTO _new_count
  FROM public.space_participants
  WHERE space_id = _space_id AND left_at IS NULL;

  UPDATE public.spaces
  SET listener_count = _new_count,
      peak_listeners = GREATEST(peak_listeners, _new_count)
  WHERE id = _space_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Create get_space_analytics RPC
CREATE OR REPLACE FUNCTION public.get_space_analytics(_space_id UUID)
RETURNS TABLE(
  total_unique_listeners BIGINT,
  peak_listeners INTEGER,
  total_messages BIGINT,
  duration_minutes NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT COUNT(DISTINCT user_id) FROM space_participants WHERE space_id = _space_id) AS total_unique_listeners,
    s.peak_listeners,
    (SELECT COUNT(*) FROM space_messages WHERE space_id = _space_id) AS total_messages,
    ROUND(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at)) / 60, 1) AS duration_minutes
  FROM spaces s
  WHERE s.id = _space_id
    AND s.host_id = auth.uid();
$$;
