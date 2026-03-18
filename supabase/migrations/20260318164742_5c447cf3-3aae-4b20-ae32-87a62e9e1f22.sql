CREATE OR REPLACE FUNCTION public.get_platform_volume()
RETURNS TABLE(prediction_volume numeric, qt_volume numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE((SELECT SUM(volume) FROM public.markets), 0) AS prediction_volume,
    COALESCE((SELECT SUM(amount) FROM public.quick_bets WHERE status IN ('won', 'lost')), 0) AS qt_volume;
$$;