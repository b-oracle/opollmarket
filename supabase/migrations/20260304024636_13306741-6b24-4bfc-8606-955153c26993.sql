-- Fix function search path for update_comment_likes_count
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
END;
$function$;

-- Fix function search path for handle_new_user_balance
CREATE OR REPLACE FUNCTION public.handle_new_user_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.balances (user_id, amount, currency)
  VALUES (NEW.id, 0, 'USDT');
  RETURN NEW;
END;
$function$;

-- Fix function search path for handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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

-- Fix function search path for notify_market_resolution
CREATE OR REPLACE FUNCTION public.notify_market_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
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