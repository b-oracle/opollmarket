
-- ============================================================
-- 1. profiles: column-level lockdown of sensitive fields
-- ============================================================
REVOKE SELECT (email, date_of_birth, location, gender, age, is_blocked, block_reason, kyc_status, referred_by)
  ON public.profiles FROM anon, authenticated;

-- Replacement RPCs for the two legitimate non-owner read paths

CREATE OR REPLACE FUNCTION public.get_referrer_counts()
RETURNS TABLE(referrer_id uuid, referred_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT referred_by, count(*)::bigint
    FROM public.profiles
   WHERE referred_by IS NOT NULL
   GROUP BY referred_by
$$;
REVOKE ALL ON FUNCTION public.get_referrer_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_referrer_counts() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_recent_referred(_since timestamptz, _limit int DEFAULT 500)
RETURNS TABLE(id uuid, display_name text, referred_by uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.display_name, p.referred_by, p.created_at
      FROM public.profiles p
     WHERE p.referred_by IS NOT NULL
       AND (_since IS NULL OR p.created_at >= _since)
     ORDER BY p.created_at DESC
     LIMIT GREATEST(COALESCE(_limit, 500), 1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_recent_referred(timestamptz, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_recent_referred(timestamptz, int) TO authenticated;

-- ============================================================
-- 2. space_participants: stop self-join on private spaces
-- ============================================================
DROP POLICY IF EXISTS "Users can join spaces" ON public.space_participants;
CREATE POLICY "Users can join spaces"
  ON public.space_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.spaces s
       WHERE s.id = space_participants.space_id
         AND (
           s.host_id = auth.uid()
           OR auth.uid() = ANY (COALESCE(s.co_host_ids, '{}'::uuid[]))
           OR s.is_private = false
           OR EXISTS (SELECT 1 FROM public.space_invites si
                       WHERE si.space_id = s.id AND si.invitee_id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.follows f
                       WHERE f.follower_id = auth.uid() AND f.following_id = s.host_id)
         )
    )
  );

-- ============================================================
-- 3. spaces.recording_egress_id: hide internal LiveKit id
-- ============================================================
REVOKE SELECT (recording_egress_id) ON public.spaces FROM anon, authenticated;

-- ============================================================
-- 4. bsc_rescan_cooldowns: explicit client write denial
-- ============================================================
DROP POLICY IF EXISTS "Deny client inserts on rescan cooldowns" ON public.bsc_rescan_cooldowns;
DROP POLICY IF EXISTS "Deny client updates on rescan cooldowns" ON public.bsc_rescan_cooldowns;
DROP POLICY IF EXISTS "Deny client deletes on rescan cooldowns" ON public.bsc_rescan_cooldowns;

CREATE POLICY "Deny client inserts on rescan cooldowns"
  ON public.bsc_rescan_cooldowns FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny client updates on rescan cooldowns"
  ON public.bsc_rescan_cooldowns FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny client deletes on rescan cooldowns"
  ON public.bsc_rescan_cooldowns FOR DELETE TO authenticated USING (false);

-- ============================================================
-- 5. notification_email_outbox: tighten to super_admin only
-- ============================================================
DROP POLICY IF EXISTS "Admins can read email outbox" ON public.notification_email_outbox;
CREATE POLICY "Super admins can read email outbox"
  ON public.notification_email_outbox FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
