CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referred_by uuid;
  v_display_name text;
  v_boracle_id uuid := 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid;
  v_agentbg_id uuid := 'cef65e17-6d57-4ce4-8eec-82a0906f9bc5'::uuid;
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

  -- Auto-follow BOracle
  BEGIN
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (NEW.id, v_boracle_id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to auto-follow BOracle for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow AgentBG
  BEGIN
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (NEW.id, v_agentbg_id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to auto-follow AgentBG for %: %', NEW.id, SQLERRM;
  END;

  -- Auto-follow referrer if provided
  IF v_referred_by IS NOT NULL
     AND v_referred_by IS DISTINCT FROM v_boracle_id
     AND v_referred_by IS DISTINCT FROM v_agentbg_id
  THEN
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