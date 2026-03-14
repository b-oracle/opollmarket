
INSERT INTO public.notifications (user_id, title, message, type, market_id)
SELECT 
  f.follower_id,
  '🏟️ New Sports Market!',
  'BOracle created a new market: "Will Manchester City beat Arsenal on Mar 22, 2026?" — Predict now!',
  'info',
  'd7dd1212-6190-4497-94b3-446e6d1d8144'::uuid
FROM public.follows f
WHERE f.following_id = 'cec1e746-a073-4841-b8a6-15e85b1c4a3a';
