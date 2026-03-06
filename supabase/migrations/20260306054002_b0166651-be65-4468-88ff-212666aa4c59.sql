
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referred_by uuid;
BEGIN
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

  INSERT INTO public.profiles (id, email, display_name, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_referred_by
  );
  RETURN NEW;
END;
$function$;
