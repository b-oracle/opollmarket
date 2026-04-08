
-- Drop the restrictive policy we just added
DROP POLICY IF EXISTS "Authenticated can read own profile" ON public.profiles;

-- Restore the original policy for app functionality
CREATE POLICY "Authenticated can read public profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (is_public = true)
  OR EXISTS (
    SELECT 1 FROM follows f
    WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
       OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
  )
);
