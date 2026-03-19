
-- Create a validation trigger to enforce image_url is not null/empty on insert
CREATE OR REPLACE FUNCTION public.validate_market_image_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.image_url IS NULL OR TRIM(NEW.image_url) = '' THEN
    RAISE EXCEPTION 'Market image_url is required. Every market must have a banner image.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_market_image_url
BEFORE INSERT ON public.markets
FOR EACH ROW
EXECUTE FUNCTION public.validate_market_image_url();
