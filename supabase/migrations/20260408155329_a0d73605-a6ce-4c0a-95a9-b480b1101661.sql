
-- Add owner_id column to api_keys
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- RLS policies for business users on api_keys
CREATE POLICY "Business users can view own api_keys"
ON public.api_keys FOR SELECT TO authenticated
USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'business'));

CREATE POLICY "Business users can insert own api_keys"
ON public.api_keys FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'business'));

CREATE POLICY "Business users can update own api_keys"
ON public.api_keys FOR UPDATE TO authenticated
USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'business'));

CREATE POLICY "Business users can delete own api_keys"
ON public.api_keys FOR DELETE TO authenticated
USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'business'));
