
CREATE OR REPLACE FUNCTION public.sync_comment_author_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name AND NEW.display_name IS NOT NULL AND NEW.display_name != '' THEN
    UPDATE public.comments
    SET author_name = NEW.display_name
    WHERE author_wallet = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_display_name_change
AFTER UPDATE OF display_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_comment_author_name();
