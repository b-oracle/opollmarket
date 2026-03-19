
-- Add Twitter fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS twitter_username TEXT,
  ADD COLUMN IF NOT EXISTS twitter_id TEXT,
  ADD COLUMN IF NOT EXISTS twitter_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS twitter_linked_at TIMESTAMPTZ;

-- Unique constraint: one X account per OPOLL account
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_twitter_id_unique UNIQUE (twitter_id);

-- Create twitter_tokens table (service-role only)
CREATE TABLE public.twitter_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.twitter_tokens ENABLE ROW LEVEL SECURITY;

-- No client access at all — only service role can read/write
CREATE POLICY "Service role only" ON public.twitter_tokens
  FOR ALL USING (false) WITH CHECK (false);

-- Create twitter_auth_sessions table for PKCE state
CREATE TABLE public.twitter_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  redirect_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.twitter_auth_sessions ENABLE ROW LEVEL SECURITY;

-- No client access — only service role
CREATE POLICY "Service role only" ON public.twitter_auth_sessions
  FOR ALL USING (false) WITH CHECK (false);

-- Auto-cleanup expired sessions (older than 10 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_expired_twitter_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.twitter_auth_sessions
  WHERE created_at < now() - interval '10 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_twitter_sessions
  AFTER INSERT ON public.twitter_auth_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_twitter_sessions();
