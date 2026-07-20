
CREATE OR REPLACE FUNCTION public.admin_search_profiles(
  _term text DEFAULT NULL::text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _sort text DEFAULT 'created_desc'
)
RETURNS TABLE(rows jsonb, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
  v_rows jsonb;
  v_pattern text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_pattern := CASE WHEN _term IS NULL OR length(trim(_term)) = 0
                    THEN NULL
                    ELSE '%' || trim(_term) || '%'
               END;

  SELECT count(*) INTO v_total
  FROM public.profiles p
  WHERE v_pattern IS NULL
     OR p.display_name ILIKE v_pattern
     OR p.username ILIKE v_pattern
     OR p.email ILIKE v_pattern;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT p.*, COALESCE(b.amount, 0) AS _balance
    FROM public.profiles p
    LEFT JOIN public.balances b ON b.user_id = p.id
    WHERE v_pattern IS NULL
       OR p.display_name ILIKE v_pattern
       OR p.username ILIKE v_pattern
       OR p.email ILIKE v_pattern
    ORDER BY
      CASE WHEN _sort = 'balance_desc' THEN COALESCE(b.amount, 0) END DESC NULLS LAST,
      CASE WHEN _sort = 'balance_asc'  THEN COALESCE(b.amount, 0) END ASC  NULLS LAST,
      CASE WHEN _sort NOT IN ('balance_desc','balance_asc') THEN p.created_at END DESC NULLS LAST
    LIMIT GREATEST(_limit, 0)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN QUERY SELECT v_rows, v_total;
END;
$function$;
