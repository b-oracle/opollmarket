CREATE POLICY "Co-hosts can update tagged markets"
ON public.spaces
FOR UPDATE
TO authenticated
USING (auth.uid() = ANY(co_host_ids))
WITH CHECK (auth.uid() = ANY(co_host_ids));