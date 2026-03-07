-- Allow moderators to read all profiles
CREATE POLICY "Moderators can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- Allow moderators to read all user_roles
CREATE POLICY "Moderators can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- Allow moderators to read all balances
CREATE POLICY "Moderators can read all balances"
ON public.balances
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));