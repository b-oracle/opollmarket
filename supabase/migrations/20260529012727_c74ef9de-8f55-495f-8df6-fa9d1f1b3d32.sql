
-- Host-only RPC: update space title
CREATE OR REPLACE FUNCTION public.host_update_space_title(_space_id uuid, _new_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host uuid;
  _title text;
BEGIN
  _title := btrim(_new_title);
  IF _title IS NULL OR length(_title) = 0 THEN
    RAISE EXCEPTION 'Title cannot be empty';
  END IF;
  IF length(_title) > 200 THEN
    RAISE EXCEPTION 'Title too long';
  END IF;

  SELECT host_id INTO _host FROM public.spaces WHERE id = _space_id;
  IF _host IS NULL THEN
    RAISE EXCEPTION 'Space not found';
  END IF;
  IF _host <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host can edit this Space';
  END IF;

  UPDATE public.spaces SET title = _title WHERE id = _space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.host_update_space_title(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_update_space_title(uuid, text) TO authenticated;

-- Host-only RPC: cancel a scheduled space, clean up reminders, notify users
CREATE OR REPLACE FUNCTION public.host_cancel_scheduled_space(_space_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host uuid;
  _status space_status;
  _title text;
  _notified integer := 0;
BEGIN
  SELECT host_id, status, title INTO _host, _status, _title
  FROM public.spaces WHERE id = _space_id;

  IF _host IS NULL THEN
    RAISE EXCEPTION 'Space not found';
  END IF;
  IF _host <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host can cancel this Space';
  END IF;
  IF _status <> 'scheduled' THEN
    RAISE EXCEPTION 'Only scheduled Spaces can be cancelled';
  END IF;

  -- Notify users who had reminders set
  INSERT INTO public.notifications (user_id, title, message, type, market_id)
  SELECT r.user_id,
         'Space Cancelled ❌',
         '"' || _title || '" has been cancelled by the host.',
         'info',
         _space_id
  FROM public.space_reminders r
  WHERE r.space_id = _space_id;
  GET DIAGNOSTICS _notified = ROW_COUNT;

  -- Remove all reminders for this space
  DELETE FROM public.space_reminders WHERE space_id = _space_id;

  -- Cancel the space
  UPDATE public.spaces SET status = 'cancelled' WHERE id = _space_id;

  RETURN _notified;
END;
$$;

REVOKE ALL ON FUNCTION public.host_cancel_scheduled_space(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_cancel_scheduled_space(uuid) TO authenticated;

-- Host-only RPC: mark recording as saved (sets is_recorded + recording_url)
CREATE OR REPLACE FUNCTION public.host_set_space_recording(_space_id uuid, _recording_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host uuid;
BEGIN
  IF _recording_url IS NULL OR length(_recording_url) = 0 THEN
    RAISE EXCEPTION 'Recording URL required';
  END IF;

  SELECT host_id INTO _host FROM public.spaces WHERE id = _space_id;
  IF _host IS NULL THEN
    RAISE EXCEPTION 'Space not found';
  END IF;
  IF _host <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host can save the recording';
  END IF;

  UPDATE public.spaces
  SET is_recorded = true,
      recording_url = _recording_url
  WHERE id = _space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.host_set_space_recording(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_set_space_recording(uuid, text) TO authenticated;

-- Host-only RPC: clear a saved recording
CREATE OR REPLACE FUNCTION public.host_clear_space_recording(_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host uuid;
BEGIN
  SELECT host_id INTO _host FROM public.spaces WHERE id = _space_id;
  IF _host IS NULL THEN
    RAISE EXCEPTION 'Space not found';
  END IF;
  IF _host <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host can delete the recording';
  END IF;

  UPDATE public.spaces
  SET is_recorded = false,
      recording_url = NULL
  WHERE id = _space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.host_clear_space_recording(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_clear_space_recording(uuid) TO authenticated;
