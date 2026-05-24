
-- 1) market_boosts: remove blanket public SELECT, restrict to owner/admin; expose discovery via view
DROP POLICY IF EXISTS "Active boosts publicly readable" ON public.market_boosts;

CREATE POLICY "Owners and admins can read boosts"
ON public.market_boosts
FOR SELECT
USING (
  (auth.uid())::text = payer_wallet
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

GRANT SELECT ON public.market_boosts_public TO anon, authenticated;

-- 2) user_security_settings: pin withdrawal-enforcement flags as immutable via self-update
DROP POLICY IF EXISTS "Users can update own security preferences" ON public.user_security_settings;

CREATE POLICY "Users can update own security preferences"
ON public.user_security_settings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT (pin_hash IS DISTINCT FROM (SELECT s.pin_hash FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (totp_secret IS DISTINCT FROM (SELECT s.totp_secret FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (pin_enabled IS DISTINCT FROM (SELECT s.pin_enabled FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (totp_enabled IS DISTINCT FROM (SELECT s.totp_enabled FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (security_setup_complete IS DISTINCT FROM (SELECT s.security_setup_complete FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (require_pin_login IS DISTINCT FROM (SELECT s.require_pin_login FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (require_totp_login IS DISTINCT FROM (SELECT s.require_totp_login FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (require_pin_withdrawal IS DISTINCT FROM (SELECT s.require_pin_withdrawal FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
  AND NOT (require_totp_withdrawal IS DISTINCT FROM (SELECT s.require_totp_withdrawal FROM public.user_security_settings s WHERE s.user_id = user_security_settings.user_id))
);

-- 3) has_role: strip email-based role inheritance branches
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  );
$function$;

-- 4) realtime.messages: require auth for any channel subscription/broadcast
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated can write realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can write realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);
