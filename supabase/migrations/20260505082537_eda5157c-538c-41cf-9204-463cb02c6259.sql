
-- 1. Add ticket_number column with sequence
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START WITH 1001;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_number INTEGER UNIQUE;

-- Backfill existing rows by created_at
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.support_tickets
  WHERE ticket_number IS NULL
)
UPDATE public.support_tickets t
SET ticket_number = 1000 + ordered.rn
FROM ordered
WHERE t.id = ordered.id;

-- Advance sequence past backfilled values
SELECT setval(
  'public.support_ticket_number_seq',
  GREATEST(1001, COALESCE((SELECT MAX(ticket_number) FROM public.support_tickets), 1000) + 1),
  false
);

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number SET DEFAULT nextval('public.support_ticket_number_seq');

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number SET NOT NULL;

-- 2. Trigger function: notify on ticket created / closed
CREATE OR REPLACE FUNCTION public.notify_support_ticket_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _service_key text;
  _event text;
BEGIN
  _url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  IF _url IS NULL OR _service_key IS NULL THEN
    SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  END IF;

  IF _url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _event := 'created';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'closed' AND COALESCE(OLD.status,'') <> 'closed' THEN
    _event := 'closed';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _url || '/functions/v1/notify-support-ticket-event',
    body := jsonb_build_object('ticket_id', NEW.id, 'event', _event)::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    )::jsonb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_created ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_created
AFTER INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_support_ticket_event();

DROP TRIGGER IF EXISTS trg_support_ticket_closed ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_closed
AFTER UPDATE OF status ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_support_ticket_event();

-- 3. Trigger function: notify on staff reply
CREATE OR REPLACE FUNCTION public.notify_support_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _service_key text;
  _ticket_owner uuid;
BEGIN
  -- Only notify when staff (or AI) replies to a ticket the user owns,
  -- and the replier is not the ticket owner themselves.
  IF NEW.is_staff IS NOT TRUE AND NEW.is_ai IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO _ticket_owner FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF _ticket_owner IS NULL OR _ticket_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  _url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  IF _url IS NULL OR _service_key IS NULL THEN
    SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  END IF;

  IF _url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _url || '/functions/v1/notify-support-ticket-event',
    body := jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'event', 'reply',
      'message_preview', LEFT(COALESCE(NEW.content, ''), 200)
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    )::jsonb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_message_reply ON public.support_messages;
CREATE TRIGGER trg_support_message_reply
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_support_ticket_reply();
