
-- Credit $12 to Mattolu's main balance (refund for failed market creation)
UPDATE public.balances
SET amount = amount + 12,
    updated_at = now()
WHERE user_id = '56959629-9dc8-47fb-9d1f-ed393ba757a7'
  AND currency = 'USDT';

-- Log the adjustment in transactions
INSERT INTO public.transactions (user_id, type, amount, status, side)
VALUES (
  '56959629-9dc8-47fb-9d1f-ed393ba757a7',
  'refund',
  12,
  'confirmed',
  'admin_refund'
);
