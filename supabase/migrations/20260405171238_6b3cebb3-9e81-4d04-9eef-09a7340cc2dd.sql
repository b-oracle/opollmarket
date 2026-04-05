
ALTER TABLE public.support_messages 
  ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.support_messages(id),
  ADD COLUMN IF NOT EXISTS reply_to_content text,
  ADD COLUMN IF NOT EXISTS reply_to_sender_name text;
