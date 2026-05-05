
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Owner can edit own message (content/edited_at). Other immutable fields enforced by trigger.
CREATE POLICY "Owners can edit own community messages"
ON public.community_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete own community messages"
ON public.community_messages
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Trigger: when content changes, stamp edited_at and prevent changing other fields.
CREATE OR REPLACE FUNCTION public.community_messages_guard_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Only the author can edit this message';
    END IF;
    NEW.edited_at = now();
    -- lock down structural fields
    NEW.user_id := OLD.user_id;
    NEW.community_slug := OLD.community_slug;
    NEW.image_url := OLD.image_url;
    NEW.reply_to_id := OLD.reply_to_id;
    NEW.reply_to_content := OLD.reply_to_content;
    NEW.reply_to_name := OLD.reply_to_name;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_messages_guard_edit_trg ON public.community_messages;
CREATE TRIGGER community_messages_guard_edit_trg
BEFORE UPDATE ON public.community_messages
FOR EACH ROW
EXECUTE FUNCTION public.community_messages_guard_edit();
