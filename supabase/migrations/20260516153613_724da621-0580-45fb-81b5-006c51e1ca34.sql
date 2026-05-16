CREATE OR REPLACE FUNCTION public.guard_referred_by_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid;
BEGIN
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    _caller := auth.uid();
    IF _caller IS NOT NULL
       AND NOT public.has_role(_caller, 'super_admin') THEN
      IF OLD.referred_by IS NOT NULL THEN
        RAISE EXCEPTION 'referred_by is locked once set; contact support to change it';
      END IF;
    END IF;

    -- Block self-referral only (founder block removed).
    IF NEW.referred_by IS NOT NULL AND NEW.referred_by = NEW.id THEN
      NEW.referred_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;