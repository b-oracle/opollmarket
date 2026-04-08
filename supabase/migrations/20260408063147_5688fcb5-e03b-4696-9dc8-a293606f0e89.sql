
-- Revoke table-level SELECT from authenticated/anon so we can use column-level grants
REVOKE SELECT ON public.user_security_settings FROM authenticated, anon;

-- Grant SELECT only on safe columns (excludes totp_secret and pin_hash)
GRANT SELECT (user_id, totp_enabled, pin_enabled, require_pin_withdrawal, require_totp_withdrawal, security_setup_complete, last_verified_at, created_at, updated_at, require_pin_login, require_totp_login) ON public.user_security_settings TO authenticated;
