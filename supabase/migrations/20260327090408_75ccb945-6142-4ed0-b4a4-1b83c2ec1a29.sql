
CREATE OR REPLACE FUNCTION public.validate_market_image_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip validation for drafts — they may not have an image yet
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.image_url IS NULL OR TRIM(NEW.image_url) = '' THEN
    RAISE EXCEPTION 'Market image_url is required. Every market must have a banner image.';
  END IF;
  RETURN NEW;
END;
$function$;
