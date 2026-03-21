
-- Add recording columns to spaces table
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS recording_egress_id text;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS is_recorded boolean NOT NULL DEFAULT false;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS recording_url text;
