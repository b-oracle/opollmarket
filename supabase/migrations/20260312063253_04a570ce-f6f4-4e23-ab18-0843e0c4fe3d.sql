-- Backfill: all existing users follow BOracle
INSERT INTO public.follows (follower_id, following_id)
SELECT p.id, 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid
FROM public.profiles p
WHERE p.id != 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'
  AND NOT EXISTS (
    SELECT 1 FROM public.follows f
    WHERE f.follower_id = p.id
      AND f.following_id = 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'
  );

-- Update handle_new_user() to auto-follow BOracle on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    VALUES (NEW.id, 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to auto-follow BOracle for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;