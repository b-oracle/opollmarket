-- Allow all authenticated users to read profiles (needed for social features like following, spaces, etc.)
CREATE POLICY "Authenticated users can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);