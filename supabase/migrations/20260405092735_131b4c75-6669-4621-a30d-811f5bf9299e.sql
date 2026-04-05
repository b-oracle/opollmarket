ALTER TABLE public.dm_messages
ADD COLUMN reply_to_id uuid REFERENCES public.dm_messages(id) ON DELETE SET NULL,
ADD COLUMN reply_to_content text,
ADD COLUMN reply_to_sender_name text;