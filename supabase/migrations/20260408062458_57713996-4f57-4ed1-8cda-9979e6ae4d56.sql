
CREATE OR REPLACE FUNCTION public.sync_market_image_to_statuses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN
    -- Update statuses linked by market_id
    UPDATE status_updates
    SET image_url = NEW.image_url
    WHERE market_id = NEW.id::text;

    -- Also update statuses that have the old image_url (legacy posts without market_id)
    IF OLD.image_url IS NOT NULL THEN
      UPDATE status_updates
      SET image_url = NEW.image_url,
          market_id = NEW.id::text
      WHERE image_url = OLD.image_url
        AND market_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_market_image_to_statuses
AFTER UPDATE OF image_url ON markets
FOR EACH ROW
EXECUTE FUNCTION sync_market_image_to_statuses();
