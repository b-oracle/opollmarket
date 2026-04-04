
CREATE OR REPLACE FUNCTION public.get_visible_spaces(_user_id uuid)
 RETURNS SETOF spaces
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.* FROM spaces s
  WHERE (
    (s.status IN ('live', 'scheduled')
      AND (
        s.host_id = _user_id
        OR EXISTS (
          SELECT 1 FROM space_invites si WHERE si.space_id = s.id AND si.invitee_id = _user_id
        )
        OR (
          s.is_private = false
          AND EXISTS (
            SELECT 1 FROM follows f
            WHERE (f.follower_id = _user_id AND f.following_id = s.host_id)
               OR (f.follower_id = s.host_id AND f.following_id = _user_id)
          )
        )
      )
    )
    OR
    (s.status = 'ended' AND s.is_recorded = true AND s.recording_url IS NOT NULL
      AND s.ended_at >= now() - interval '7 days'
      AND (
        s.host_id = _user_id
        OR EXISTS (
          SELECT 1 FROM follows f
          WHERE (f.follower_id = _user_id AND f.following_id = s.host_id)
             OR (f.follower_id = s.host_id AND f.following_id = _user_id)
        )
      )
    )
  )
  ORDER BY
    CASE WHEN s.status = 'live' THEN 0 WHEN s.status = 'scheduled' THEN 1 ELSE 2 END,
    CASE WHEN s.status = 'live' THEN s.listener_count END DESC NULLS LAST,
    CASE WHEN s.status = 'live' THEN s.started_at END DESC NULLS LAST,
    s.scheduled_at ASC NULLS LAST,
    s.ended_at DESC NULLS LAST
  LIMIT 30;
$function$;
