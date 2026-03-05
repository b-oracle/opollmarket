
CREATE OR REPLACE FUNCTION public.notify_admins_pending_market()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, market_id)
    SELECT ur.user_id,
      'Market Pending Review 🔍',
      'A new market "' || NEW.title || '" was flagged as similar to an existing one and needs your approval.',
      'pending_review',
      NEW.id
    FROM public.user_roles ur
    WHERE ur.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_market_pending_notify_admins
  AFTER INSERT ON public.markets
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_admins_pending_market();
