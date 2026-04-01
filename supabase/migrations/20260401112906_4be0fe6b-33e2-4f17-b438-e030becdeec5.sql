-- 1. Restrict market_options: creators can only update non-price fields on non-draft markets
-- Drop existing permissive creator insert policy and add price restriction
-- Creators can still INSERT options, but UPDATE on price is blocked for non-draft markets

-- No existing creator UPDATE policy on market_options, so we just need to ensure
-- the INSERT policy blocks price manipulation. Actually, creators CAN'T update options
-- (no UPDATE policy for creators exists). But they CAN insert with arbitrary prices.
-- Fix: restrict INSERT to only allow default price (0) for non-admin creators.

-- Actually the real fix: ensure creators can only insert options on DRAFT markets
DROP POLICY IF EXISTS "Creators can insert own market options" ON public.market_options;
CREATE POLICY "Creators can insert own market options"
ON public.market_options
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM markets
    WHERE markets.id = market_options.market_id
      AND markets.creator_wallet = (auth.uid())::text
      AND markets.status = 'draft'
  )
);

-- 2. Fix copy_settings RLS: change from public to authenticated
DROP POLICY IF EXISTS "Users can read own copy settings" ON public.copy_settings;
DROP POLICY IF EXISTS "Users can insert own copy settings" ON public.copy_settings;
DROP POLICY IF EXISTS "Users can update own copy settings" ON public.copy_settings;
DROP POLICY IF EXISTS "Users can delete own copy settings" ON public.copy_settings;

CREATE POLICY "Users can read own copy settings"
ON public.copy_settings FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own copy settings"
ON public.copy_settings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own copy settings"
ON public.copy_settings FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own copy settings"
ON public.copy_settings FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 3. Fix BOracle default referral: set to NULL instead of hardcoded UUID
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referred_by uuid;
  v_display_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NEW.raw_user_meta_data->>'referred_by' IS NOT NULL
       AND NEW.raw_user_meta_data->>'referred_by' != ''
    THEN
      v_referred_by := (NEW.raw_user_meta_data->>'referred_by')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    v_referred_by := NULL;
  END;

  -- No longer default to BOracle — only reward genuine referrals
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  BEGIN
    INSERT INTO public.profiles (id, email, display_name, referred_by)
    VALUES (NEW.id, NEW.email, v_display_name, v_referred_by);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to create profile for %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.balances (user_id, amount, currency)
    VALUES (NEW.id, 0, 'USDT');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to create balance for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow BOracle (social feature, not financial)
  BEGIN
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (NEW.id, 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to auto-follow BOracle for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow referrer if provided
  IF v_referred_by IS NOT NULL AND v_referred_by IS DISTINCT FROM 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid THEN
    BEGIN
      INSERT INTO public.follows (follower_id, following_id)
      VALUES (NEW.id, v_referred_by);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user: failed to auto-follow referrer for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;