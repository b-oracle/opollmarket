
-- Fix: Add UPDATE policy so users can react to and edit messages
CREATE POLICY "Users can update support messages they can view"
ON public.support_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = support_messages.ticket_id
    AND (
      t.user_id = auth.uid()
      OR has_role(auth.uid(), 'support'::app_role)
      OR has_role(auth.uid(), 'moderator'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);

-- Fix: Add DELETE policy so users can delete their own messages
CREATE POLICY "Users can delete own support messages"
ON public.support_messages
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = support_messages.ticket_id
    AND (
      t.user_id = auth.uid()
      OR has_role(auth.uid(), 'support'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);

-- Notification trigger: notify ticket owner when staff replies, notify staff when user messages
CREATE OR REPLACE FUNCTION public.notify_support_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ticket record;
  _sender_name text;
BEGIN
  SELECT * INTO _ticket FROM support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, 'Support') INTO _sender_name FROM profiles WHERE id = NEW.user_id;

  -- Staff/AI message -> notify ticket owner
  IF (NEW.is_staff OR COALESCE(NEW.is_ai, false)) AND NEW.user_id != _ticket.user_id THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (_ticket.user_id, 'Support Reply 💬', _sender_name || ' replied to "' || _ticket.subject || '"', 'info');
  END IF;

  -- User message -> notify support staff
  IF NOT NEW.is_staff AND NOT COALESCE(NEW.is_ai, false) THEN
    INSERT INTO notifications (user_id, title, message, type)
    SELECT ur.user_id, 'New Support Message 📩', _sender_name || ' on "' || _ticket.subject || '"', 'info'
    FROM user_roles ur
    WHERE ur.role = 'support' AND ur.user_id != NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_support_message ON public.support_messages;
CREATE TRIGGER trg_notify_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_support_message();
