CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users requested_user
    JOIN auth.users role_user
      ON lower(role_user.email) = lower(requested_user.email)
     AND role_user.email_confirmed_at IS NOT NULL
    JOIN public.user_roles ur
      ON ur.user_id = role_user.id
     AND ur.role = _role
    WHERE requested_user.id = _user_id
      AND requested_user.email_confirmed_at IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users role_user
    JOIN public.user_roles ur
      ON ur.user_id = role_user.id
     AND ur.role = _role
    WHERE auth.uid() = _user_id
      AND lower(role_user.email) = lower(auth.jwt() ->> 'email')
      AND role_user.email_confirmed_at IS NOT NULL
      AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_balance(uuid, numeric, numeric, numeric) TO authenticated;