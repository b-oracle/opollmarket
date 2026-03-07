
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
  -- Skip if profile already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Safely try to cast referred_by to uuid, ignore if invalid
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
    VALUES (
      NEW.id,
      NEW.email,
      v_display_name,
      v_referred_by
    );
  EXCEPTION WHEN others THEN
    -- Log but don't block signup
    RAISE WARNING 'handle_new_user: failed to create profile for %: %', NEW.id, SQLERRM;
  END;

  -- Also create balance record to prevent separate trigger failure
  BEGIN
    INSERT INTO public.balances (user_id, amount, currency)
    VALUES (NEW.id, 0, 'USDT');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to create balance for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
