
-- Add visibility_scope column
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT 'followers_network';

-- Add indexes on follows for reverse lookups
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows (following_id);

-- Create RPC to get spaces visible to current user (follow network filtering)
CREATE OR REPLACE FUNCTION public.get_visible_spaces(_user_id uuid)
RETURNS SETOF spaces
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.* FROM spaces s
  WHERE s.status IN ('live', 'scheduled')
    AND (
      s.host_id = _user_id
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE (f.follower_id = _user_id AND f.following_id = s.host_id)
           OR (f.follower_id = s.host_id AND f.following_id = _user_id)
      )
    )
  ORDER BY
    CASE WHEN s.status = 'live' THEN 0 ELSE 1 END,
    CASE WHEN s.status = 'live' THEN s.listener_count END DESC NULLS LAST,
    CASE WHEN s.status = 'live' THEN s.started_at END DESC NULLS LAST,
    s.scheduled_at ASC NULLS LAST
  LIMIT 30;
$$;

-- Create RPC to count live spaces visible to current user (for badge)
CREATE OR REPLACE FUNCTION public.count_visible_live_spaces(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM spaces s
  WHERE s.status = 'live'
    AND (
      s.host_id = _user_id
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE (f.follower_id = _user_id AND f.following_id = s.host_id)
           OR (f.follower_id = s.host_id AND f.following_id = _user_id)
      )
    );
$$;

-- Replace the open SELECT policy with follow-network-based visibility
DROP POLICY IF EXISTS "Anyone can read live spaces" ON public.spaces;

CREATE POLICY "Users can read own and network spaces"
ON public.spaces
FOR SELECT
USING (
  auth.uid() = host_id
  OR EXISTS (
    SELECT 1 FROM follows f
    WHERE (f.follower_id = auth.uid() AND f.following_id = host_id)
       OR (f.follower_id = host_id AND f.following_id = auth.uid())
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
