
CREATE OR REPLACE FUNCTION public.notify_market_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, market_id)
    VALUES (
      NEW.creator_wallet::uuid,
      'Market Approved! 🎉',
      'Your market "' || NEW.title || '" has been approved! Place your first prediction (min $5) to make it visible to everyone.',
      'info',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_market_approved
  AFTER UPDATE ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_market_approved();
