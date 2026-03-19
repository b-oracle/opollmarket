
-- Add scheduled_at and reminder_count columns to spaces
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;

-- Create space_reminders table if not exists
CREATE TABLE IF NOT EXISTS public.space_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(space_id, user_id)
);

ALTER TABLE public.space_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reminders" ON public.space_reminders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can set their own reminders" ON public.space_reminders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reminders" ON public.space_reminders
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger to update reminder_count on spaces
CREATE OR REPLACE FUNCTION public.update_space_reminder_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.spaces SET reminder_count = (
      SELECT COUNT(*) FROM public.space_reminders WHERE space_id = NEW.space_id
    ) WHERE id = NEW.space_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.spaces SET reminder_count = (
      SELECT COUNT(*) FROM public.space_reminders WHERE space_id = OLD.space_id
    ) WHERE id = OLD.space_id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_space_reminder_count ON public.space_reminders;
CREATE TRIGGER trg_update_space_reminder_count
AFTER INSERT OR DELETE ON public.space_reminders
FOR EACH ROW EXECUTE FUNCTION public.update_space_reminder_count();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_space_reminders_space_id ON public.space_reminders(space_id);
CREATE INDEX IF NOT EXISTS idx_space_reminders_user_id ON public.space_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_spaces_scheduled ON public.spaces(scheduled_at) WHERE status = 'scheduled';
