
-- Update handle_new_user to capture referred_by from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'referred_by' IS NOT NULL
        AND NEW.raw_user_meta_data->>'referred_by' != ''
      THEN (NEW.raw_user_meta_data->>'referred_by')::uuid
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$function$;
