ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS email_market_won boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_market_lost boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_market_expired_creator boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_deposit_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_withdrawal_completed boolean NOT NULL DEFAULT true;