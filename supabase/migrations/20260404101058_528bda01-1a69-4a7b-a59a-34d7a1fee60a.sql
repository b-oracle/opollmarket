
-- Allow authenticated users to read public profiles and profiles in their network
-- The public_profiles view hides email/DOB/etc at column level
CREATE POLICY "Authenticated can read public profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
         OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
    )
  );
