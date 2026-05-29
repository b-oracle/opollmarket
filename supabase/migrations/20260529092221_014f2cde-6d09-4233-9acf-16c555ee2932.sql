CREATE OR REPLACE FUNCTION public.host_go_live_scheduled_space(_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_status text;
BEGIN
  SELECT host_id, status INTO v_host, v_status FROM public.spaces WHERE id = _space_id;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Space not found'; END IF;
  IF v_host <> auth.uid() THEN RAISE EXCEPTION 'Not host'; END IF;
  IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'Space not scheduled'; END IF;

  UPDATE public.spaces
  SET status = 'live', started_at = now()
  WHERE id = _space_id;

  -- Notify users with reminders (excluding host)
  INSERT INTO public.notifications (user_id, title, message, type, market_id, actor_id)
  SELECT DISTINCT r.user_id,
         'Space is Live! 🎙️',
         (SELECT 'Space "' || title || '" started early. Join now!' FROM public.spaces WHERE id = _space_id),
         'info', _space_id, v_host
  FROM public.space_reminders r
  WHERE r.space_id = _space_id AND r.user_id <> v_host;

  -- Clear reminders
  DELETE FROM public.space_reminders WHERE space_id = _space_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.host_go_live_scheduled_space(uuid) TO authenticated;