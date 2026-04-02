
-- Add is_private column to spaces
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- Create space_invites table
CREATE TABLE public.space_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(space_id, invitee_id)
);

ALTER TABLE public.space_invites ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read invites (needed for join-gating)
CREATE POLICY "Anyone can read invites" ON public.space_invites
  FOR SELECT TO authenticated USING (true);

-- Inviters can insert
CREATE POLICY "Inviters can insert" ON public.space_invites
  FOR INSERT TO authenticated WITH CHECK (inviter_id = auth.uid());

-- Inviters can delete their own invites
CREATE POLICY "Inviters can delete" ON public.space_invites
  FOR DELETE TO authenticated USING (inviter_id = auth.uid());

-- Update get_visible_spaces to include private spaces only for host/invitees
CREATE OR REPLACE FUNCTION public.get_visible_spaces(_user_id uuid)
 RETURNS SETOF spaces
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.* FROM spaces s
  WHERE (
    -- Live or scheduled spaces from network (non-private or invited/host)
    (s.status IN ('live', 'scheduled')
      AND (
        s.host_id = _user_id
        OR (
          (s.is_private = false OR EXISTS (
            SELECT 1 FROM space_invites si WHERE si.space_id = s.id AND si.invitee_id = _user_id
          ))
          AND EXISTS (
            SELECT 1 FROM follows f
            WHERE (f.follower_id = _user_id AND f.following_id = s.host_id)
               OR (f.follower_id = s.host_id AND f.following_id = _user_id)
          )
        )
      )
    )
    OR
    -- Ended spaces with recordings from network (last 7 days)
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
