
CREATE OR REPLACE FUNCTION public.get_live_space_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT sp.user_id
  FROM space_participants sp
  INNER JOIN spaces s ON s.id = sp.space_id
  WHERE s.status = 'live'
    AND sp.left_at IS NULL;
$$;
