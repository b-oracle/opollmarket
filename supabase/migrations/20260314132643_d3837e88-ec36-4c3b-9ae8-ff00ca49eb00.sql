CREATE OR REPLACE FUNCTION public.notify_first_prediction_needed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
BEGIN
  IF NEW.status <> 'active' OR COALESCE(NEW.participants, 0) > 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.creator_wallet IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.creator_wallet ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_creator_id := NEW.creator_wallet::uuid;
  ELSE
    RETURN NEW;
  END IF;

  IF public.has_role(v_creator_id, 'admin')
     OR public.has_role(v_creator_id, 'super_admin')
     OR public.has_role(v_creator_id, 'moderator') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, market_id)
  SELECT
    v_creator_id,
    'Your market is almost live! 📣',
    'Place your first prediction (min $5) to make "' || NEW.title || '" visible on the feed.',
    'first_prediction_required',
    NEW.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = v_creator_id
      AND n.market_id = NEW.id
      AND n.type = 'first_prediction_required'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_first_prediction_needed ON public.markets;
CREATE TRIGGER trg_notify_first_prediction_needed
AFTER INSERT ON public.markets
FOR EACH ROW
EXECUTE FUNCTION public.notify_first_prediction_needed();