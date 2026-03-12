
-- Allow users to update their own comments (content only)
CREATE POLICY "Users can update own comments"
ON public.comments
FOR UPDATE
TO authenticated
USING ((auth.uid())::text = author_wallet)
WITH CHECK ((auth.uid())::text = author_wallet);

-- Allow users to delete their own comments
CREATE POLICY "Users can delete own comments"
ON public.comments
FOR DELETE
TO authenticated
USING ((auth.uid())::text = author_wallet);
