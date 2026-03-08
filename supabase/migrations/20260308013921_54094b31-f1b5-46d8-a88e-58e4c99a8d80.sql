
-- Create telegram_users table to link Telegram accounts to platform users
CREATE TABLE public.telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  telegram_chat_id bigint NOT NULL UNIQUE,
  telegram_username text,
  linked_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own link
CREATE POLICY "Users can read own telegram link"
  ON public.telegram_users FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete own link
CREATE POLICY "Users can delete own telegram link"
  ON public.telegram_users FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can read all telegram users"
  ON public.telegram_users FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role handles inserts/updates via edge functions
