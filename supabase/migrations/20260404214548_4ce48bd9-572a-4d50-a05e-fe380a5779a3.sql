ALTER TABLE public.space_messages
  ADD COLUMN reply_to_id uuid REFERENCES public.space_messages(id) ON DELETE SET NULL,
  ADD COLUMN reply_to_content text,
  ADD COLUMN reply_to_name text;