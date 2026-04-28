-- Fix signup failure: qualify pgcrypto digest() with extensions schema
-- since handle_new_user has search_path locked to 'public'.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user'::regproc) INTO v_def;
  v_def := replace(v_def, 'encode(digest(v_ua, ''sha256''), ''hex'')',
                          'encode(extensions.digest(v_ua, ''sha256''), ''hex'')');
  EXECUTE v_def;
END$$;