
-- WhatsApp users table (mirrors telegram_users)
CREATE TABLE public.whatsapp_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  whatsapp_phone TEXT NOT NULL UNIQUE,
  display_name TEXT,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint on whatsapp_phone for upsert
CREATE UNIQUE INDEX whatsapp_users_phone_idx ON public.whatsapp_users (whatsapp_phone);
CREATE INDEX whatsapp_users_user_id_idx ON public.whatsapp_users (user_id);

ALTER TABLE public.whatsapp_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own WhatsApp link
CREATE POLICY "Users can view own whatsapp link"
ON public.whatsapp_users FOR SELECT
USING (auth.uid() = user_id);

-- Users can delete their own link
CREATE POLICY "Users can delete own whatsapp link"
ON public.whatsapp_users FOR DELETE
USING (auth.uid() = user_id);

-- WhatsApp sessions table for multi-step flows (linking, custom amounts, FAQ)
CREATE TABLE public.whatsapp_sessions (
  phone TEXT NOT NULL PRIMARY KEY,
  state TEXT NOT NULL DEFAULT '',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- No public RLS policies needed - sessions are managed by edge functions via service role
