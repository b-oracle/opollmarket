
-- Create platform_pool table (single-row, tracks platform revenue)
CREATE TABLE public.platform_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert initial row
INSERT INTO public.platform_pool (balance) VALUES (0);

-- Enable RLS but no policies (only service role accesses this)
ALTER TABLE public.platform_pool ENABLE ROW LEVEL SECURITY;

-- Admin read-only policy so dashboard can read it
CREATE POLICY "Admins can read platform pool"
  ON public.platform_pool
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Create atomic adjust function
CREATE OR REPLACE FUNCTION public.adjust_platform_pool(_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.platform_pool
  SET balance = balance + _delta,
      updated_at = now()
  WHERE id = (SELECT id FROM public.platform_pool LIMIT 1);
END;
$$;
