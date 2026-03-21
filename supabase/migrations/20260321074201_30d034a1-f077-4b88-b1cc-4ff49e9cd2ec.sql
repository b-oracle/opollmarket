
-- Add personalization columns to profiles (private, only visible to the user)
ALTER TABLE public.profiles
  ADD COLUMN age integer,
  ADD COLUMN gender text,
  ADD COLUMN location text,
  ADD COLUMN interests text[] DEFAULT '{}';
