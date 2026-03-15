-- Cancel 3 phantom limit orders placed before the server-side fix.
-- No refund needed since no funds were ever escrowed.
UPDATE public.limit_orders
SET status = 'cancelled', updated_at = now()
WHERE id IN (
  'cb53b37f-20dc-4b0d-973b-7843bb894f22',
  'c139a253-8cbb-41b6-863e-1e1849e5be76',
  '6449b54a-d8eb-4b7e-99a2-49107a0aa077'
) AND status = 'pending';