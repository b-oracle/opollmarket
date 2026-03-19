
-- Add market_id column to status_updates
ALTER TABLE public.status_updates
ADD COLUMN market_id uuid REFERENCES public.markets(id) ON DELETE SET NULL;

-- Insert feature toggle for status image upload (disabled by default)
INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('status_image_upload', 'Status Image Upload', false)
ON CONFLICT DO NOTHING;
