
ALTER TABLE public.user_security_settings
  ADD COLUMN require_pin_login boolean NOT NULL DEFAULT false,
  ADD COLUMN require_totp_login boolean NOT NULL DEFAULT false;
