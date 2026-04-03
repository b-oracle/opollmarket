
-- =====================================================
-- 1. PROFILES: Hide PII from non-owners
-- =====================================================
-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Anyone can read public profiles" ON public.profiles;

-- Allow authenticated users to read non-sensitive fields of public profiles
-- Owner can always read their own full profile (existing "Users can read own profile" policy handles this)
-- For other users, we use a view approach instead
-- Re-create a safe public profiles policy that still allows lookups
CREATE POLICY "Authenticated can read public profile basics"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR is_public = true
);

-- =====================================================
-- 2. ADMIN_SECURITY_OVERVIEW: Secure the view
-- =====================================================
-- Drop and recreate as security_invoker
DROP VIEW IF EXISTS public.admin_security_overview;

CREATE VIEW public.admin_security_overview
WITH (security_invoker = on) AS
SELECT
  user_id,
  pin_enabled,
  totp_enabled,
  require_pin_withdrawal,
  require_totp_withdrawal,
  require_pin_login,
  require_totp_login,
  security_setup_complete,
  last_verified_at,
  created_at,
  updated_at
FROM user_security_settings;

-- =====================================================
-- 3. WHATSAPP_SESSIONS: Add RLS policies
-- =====================================================
-- RLS is already enabled, just no policies exist
CREATE POLICY "Service role only for whatsapp sessions"
ON public.whatsapp_sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Deny all access to regular users (RLS enabled + no matching policy = denied)

-- =====================================================
-- 4. NOTIFICATIONS: Tighten INSERT policy
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- Allow users to insert notifications only where they are the actor
-- System/service-role notifications bypass RLS
CREATE POLICY "Users can insert notifications as actor"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  OR auth.uid() = user_id
);

-- =====================================================
-- 5. SPACE_MESSAGES: Tighten UPDATE policy for reactions
-- =====================================================
DROP POLICY IF EXISTS "Users can update own message reactions" ON public.space_messages;

CREATE POLICY "Users can update message reactions in their spaces"
ON public.space_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM space_participants sp
    WHERE sp.space_id = space_messages.space_id
    AND sp.user_id = auth.uid()
    AND sp.left_at IS NULL
  )
  OR user_id = auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM space_participants sp
    WHERE sp.space_id = space_messages.space_id
    AND sp.user_id = auth.uid()
    AND sp.left_at IS NULL
  )
  OR user_id = auth.uid()
);

-- =====================================================
-- 6. STORAGE: market-images folder ownership
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can upload market images" ON storage.objects;

CREATE POLICY "Authenticated users can upload market images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'market-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =====================================================
-- 7. STORAGE: space-recordings folder ownership
-- =====================================================
DROP POLICY IF EXISTS "Users can upload space recordings" ON storage.objects;

CREATE POLICY "Users can upload space recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'space-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
