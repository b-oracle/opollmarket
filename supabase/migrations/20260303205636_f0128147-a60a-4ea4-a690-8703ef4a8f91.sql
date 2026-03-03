-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  market_id uuid REFERENCES public.markets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications" ON public.notifications
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
FOR UPDATE TO authenticated USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert notifications" ON public.notifications
FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create a function to auto-notify winners on market resolution
CREATE OR REPLACE FUNCTION public.notify_market_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    -- Notify all users with positions in this market
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
$$;

CREATE TRIGGER on_market_status_change
  AFTER UPDATE OF status ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_market_resolution();
