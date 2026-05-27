-- Restore table-level SELECT on profiles to authenticated. RLS policies
-- already restrict rows to owner / admin / public-or-followed profiles,
-- so column-level restriction was over-zealous and broke profile pages
-- (wallet_address, twitter_id) and owner self-reads (email, etc.).
GRANT SELECT ON public.profiles TO authenticated;