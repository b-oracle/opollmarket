
-- Create user_security_settings table
CREATE TABLE public.user_security_settings (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  pin_enabled boolean NOT NULL DEFAULT false,
  require_pin_withdrawal boolean NOT NULL DEFAULT true,
  require_totp_withdrawal boolean NOT NULL DEFAULT false,
  security_setup_complete boolean NOT NULL DEFAULT false,
  last_verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;

-- Users can read own settings
CREATE POLICY "Users can read own security settings"
  ON public.user_security_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update own settings (toggles only, not secrets — those go via edge functions)
CREATE POLICY "Users can update own security settings"
  ON public.user_security_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can read all security settings"
  ON public.user_security_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create row when profile is created
CREATE OR REPLACE FUNCTION public.handle_new_security_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.user_security_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'handle_new_security_settings: failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_security
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_security_settings();
