
CREATE TABLE IF NOT EXISTS public.bot_link_tokens (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('telegram','whatsapp')),
  telegram_chat_id BIGINT,
  telegram_username TEXT,
  whatsapp_phone TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  claimed_at TIMESTAMPTZ,
  claimed_by UUID
);

CREATE INDEX IF NOT EXISTS bot_link_tokens_expires_idx ON public.bot_link_tokens (expires_at);
CREATE INDEX IF NOT EXISTS bot_link_tokens_telegram_idx ON public.bot_link_tokens (telegram_chat_id);
CREATE INDEX IF NOT EXISTS bot_link_tokens_whatsapp_idx ON public.bot_link_tokens (whatsapp_phone);

-- Tokens are managed entirely by service role (bot mints, edge function claims).
-- No anon/authenticated direct access — claim happens through claim-bot-link edge function.
GRANT ALL ON public.bot_link_tokens TO service_role;

ALTER TABLE public.bot_link_tokens ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated → table is inaccessible via PostgREST,
-- which is the intent. Service role bypasses RLS.
