-- Remove client SELECT policy on notification_email_outbox.
-- This table is only read by service_role edge functions (process-notification-emails,
-- _shared/notificationEmail.ts); no client code reads it. Removing the policy prevents
-- recipient_email from being returned to clients under any condition.
DROP POLICY IF EXISTS "Users read own outbox" ON public.notification_email_outbox;

-- Also revoke SELECT on the table from authenticated/anon as defense in depth;
-- service_role retains full access.
REVOKE SELECT ON public.notification_email_outbox FROM authenticated;
REVOKE SELECT ON public.notification_email_outbox FROM anon;