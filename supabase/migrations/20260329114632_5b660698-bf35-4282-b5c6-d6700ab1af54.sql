
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  _target_user_id uuid,
  _unlimited_markets boolean DEFAULT NULL,
  _is_blocked boolean DEFAULT NULL,
  _blocked_at timestamptz DEFAULT NULL,
  _block_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins/super_admins can call this
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
  SET
    unlimited_markets = COALESCE(_unlimited_markets, unlimited_markets),
    is_blocked = COALESCE(_is_blocked, is_blocked),
    blocked_at = CASE WHEN _is_blocked IS NOT NULL THEN _blocked_at ELSE blocked_at END,
    block_reason = CASE WHEN _is_blocked IS NOT NULL THEN _block_reason ELSE block_reason END,
    updated_at = now()
  WHERE id = _target_user_id;
END;
$$;
