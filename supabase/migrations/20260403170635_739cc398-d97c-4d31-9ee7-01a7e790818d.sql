
-- Allow anyone to read commission_settings (the view already restricts columns)
CREATE POLICY "Anyone can read commission settings via view"
ON public.commission_settings FOR SELECT TO anon, authenticated
USING (true);

-- Allow anyone to read confirmed buy/sell transactions (the view already filters)
CREATE POLICY "Anyone can read confirmed trades via view"
ON public.transactions FOR SELECT TO anon
USING (type IN ('buy', 'sell') AND status = 'confirmed');
