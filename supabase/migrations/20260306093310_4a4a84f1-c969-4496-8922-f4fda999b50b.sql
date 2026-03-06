CREATE OR REPLACE FUNCTION public.notify_market_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip auto-resolve markets (they handle their own notifications in the edge function)
  IF NEW.auto_resolve = true THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    INSERT INTO public.notifications (user_id, title, message, type, market_id)
    SELECT DISTINCT p.user_id,
      'Market Resolved',
      'A market you predicted on has been resolved: ' || NEW.title,
      CASE
        WHEN (NEW.market_type = 'binary' AND NEW.resolved_side = p.side) THEN 'payout'
        WHEN (NEW.market_type = 'multi' AND NEW.winning_option_id = p.option_id) THEN 'payout'
        ELSE 'resolution'
      END,
      NEW.id
    FROM public.positions p
    WHERE p.market_id = NEW.id AND p.shares > 0;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    INSERT INTO public.notifications (user_id, title, message, type, market_id)
    SELECT DISTINCT p.user_id,
      'Market Cancelled — Refunded',
      'A market you predicted on has been cancelled. Your funds have been refunded.',
      'refund',
      NEW.id
    FROM public.positions p
    WHERE p.market_id = NEW.id AND p.shares > 0;
  END IF;

  RETURN NEW;
END;
$function$;