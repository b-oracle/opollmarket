ALTER TABLE public.user_fcm_tokens
  ADD COLUMN IF NOT EXISTS token_type text NOT NULL DEFAULT 'standard';

-- Allowed values: 'standard' (FCM/APNs alert push) or 'voip' (iOS PushKit VoIP token, sent direct to APNs)
ALTER TABLE public.user_fcm_tokens
  DROP CONSTRAINT IF EXISTS user_fcm_tokens_token_type_check;

ALTER TABLE public.user_fcm_tokens
  ADD CONSTRAINT user_fcm_tokens_token_type_check
  CHECK (token_type IN ('standard','voip'));

CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user_platform_type
  ON public.user_fcm_tokens (user_id, platform, token_type);