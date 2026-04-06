INSERT INTO public.feature_toggles (feature_key, label, enabled) VALUES
  ('dm_gifts', 'DM Emoji Gifts', true),
  ('dm_money_transfer', 'DM Direct Money Transfer', true),
  ('gift_animations', 'Gift Tap Animations', true)
ON CONFLICT DO NOTHING;