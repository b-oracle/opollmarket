-- FIX 1: Remove duplicate dm_conversations INSERT policy that bypasses mutual_follow check
-- The "Users can create dm conversations" policy has NO mutual_follow guard,
-- allowing any authenticated user to message anyone. Since PERMISSIVE policies
-- are ORed, this completely bypasses the stricter policy.
DROP POLICY IF EXISTS "Users can create dm conversations" ON public.dm_conversations;

-- FIX 2: Harden user_security_settings UPDATE policy
-- Currently users can directly modify pin_hash, totp_secret, and toggle
-- security flags like require_pin_login=false to bypass 2FA.
-- Only allow users to update non-sensitive preference columns.
DROP POLICY IF EXISTS "Users can update own security settings" ON public.user_security_settings;

CREATE POLICY "Users can update own security preferences"
ON public.user_security_settings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  -- Ensure sensitive fields remain unchanged (only server-side edge functions can modify these)
  AND pin_hash IS NOT DISTINCT FROM (SELECT s.pin_hash FROM user_security_settings s WHERE s.user_id = user_security_settings.user_id)
  AND totp_secret IS NOT DISTINCT FROM (SELECT s.totp_secret FROM user_security_settings s WHERE s.user_id = user_security_settings.user_id)
  AND pin_enabled IS NOT DISTINCT FROM (SELECT s.pin_enabled FROM user_security_settings s WHERE s.user_id = user_security_settings.user_id)
  AND totp_enabled IS NOT DISTINCT FROM (SELECT s.totp_enabled FROM user_security_settings s WHERE s.user_id = user_security_settings.user_id)
  AND security_setup_complete IS NOT DISTINCT FROM (SELECT s.security_setup_complete FROM user_security_settings s WHERE s.user_id = user_security_settings.user_id)
  AND require_pin_login IS NOT DISTINCT FROM (SELECT s.require_pin_login FROM user_security_settings s WHERE s.user_id = user_security_settings.user_id)
  AND require_totp_login IS NOT DISTINCT FROM (SELECT s.require_totp_login FROM user_security_settings s WHERE s.user_id = user_security_settings.user_id)
);