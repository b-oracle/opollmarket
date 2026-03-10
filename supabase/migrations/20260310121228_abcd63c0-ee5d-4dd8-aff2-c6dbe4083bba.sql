
CREATE OR REPLACE FUNCTION public.handle_new_user_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.balances (user_id, amount, currency)
  VALUES (NEW.id, 0, 'USDT')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'handle_new_user_balance: failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;
