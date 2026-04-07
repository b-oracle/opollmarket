-- Allow authenticated users to insert new quick trade rounds
CREATE POLICY "Authenticated users can create rounds"
ON public.quick_rounds
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also allow authenticated users to update rounds (for locking/resolving via edge function fallback)
CREATE POLICY "Authenticated users can update rounds"
ON public.quick_rounds
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);