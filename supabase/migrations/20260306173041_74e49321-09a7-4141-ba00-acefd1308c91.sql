CREATE POLICY "Authenticated users can create quick rounds"
ON public.quick_rounds
FOR INSERT
TO authenticated
WITH CHECK (true);