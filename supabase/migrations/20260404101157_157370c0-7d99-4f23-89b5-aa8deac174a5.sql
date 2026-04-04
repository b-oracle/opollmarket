
-- Remove public/anon SELECT on commission_settings
DROP POLICY IF EXISTS "Anyone can read commission settings via view" ON public.commission_settings;

-- Remove anon SELECT on transactions
DROP POLICY IF EXISTS "Anyone can read confirmed trades via view" ON public.transactions;
