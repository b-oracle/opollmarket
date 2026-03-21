
-- Fix adedavid's over-credited deposit: was credited $898.05 instead of $10
-- Correct balance: deduct the excess $888.0465776
-- Also update the transaction record to reflect the actual $10 deposit

-- 1. Fix the transaction amount to match the actual $10 deposit
UPDATE public.transactions
SET amount = 10
WHERE id = 'e1689967-52a2-4b78-bdb8-a6f8ddb93168'
  AND nowpayments_payment_id = '5672907403';

-- 2. Deduct the excess from balance (898.0465776 - 10 = 888.0465776)
SELECT public.adjust_balance(
  '97c0b15e-8a17-4675-af96-0e41a6cc45fb'::uuid,
  -888.0465776,
  0,
  0
);
