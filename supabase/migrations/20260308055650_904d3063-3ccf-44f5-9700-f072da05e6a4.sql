
CREATE TABLE public.telegram_link_sessions (
  chat_id bigint PRIMARY KEY,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Auto-expire sessions older than 5 minutes
CREATE OR REPLACE FUNCTION public.cleanup_expired_link_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.telegram_link_sessions
  WHERE created_at < now() - interval '5 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_link_sessions
  BEFORE INSERT ON public.telegram_link_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_link_sessions();
