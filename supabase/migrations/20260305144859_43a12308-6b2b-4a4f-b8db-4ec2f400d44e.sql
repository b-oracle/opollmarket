
-- Moderation logs table to track all flagged content
CREATE TABLE public.moderation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL, -- 'comment', 'market', 'image', 'display_name'
  content_id text, -- ID of the flagged content (comment id, market id, etc)
  user_id uuid, -- who triggered the moderation
  flagged_content text, -- the actual text/url that was flagged
  reason text NOT NULL DEFAULT '',
  category text, -- moderation category (profanity, nsfw, hate_speech, etc)
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_by uuid, -- admin who reviewed
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read moderation logs
CREATE POLICY "Admins can read moderation logs"
  ON public.moderation_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can update moderation logs (for review)
CREATE POLICY "Admins can update moderation logs"
  ON public.moderation_logs
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Edge functions can insert logs (service role)
CREATE POLICY "Service can insert moderation logs"
  ON public.moderation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow anon insert for edge functions using service role
CREATE POLICY "Anon can insert moderation logs"
  ON public.moderation_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);
