
-- 1. Delete the invalid position (yes side with no option_id on a range market)
DELETE FROM positions WHERE id = '4fd7b772-ce3e-4f9b-b359-3eea5c6419ed';

-- 2. Delete the bad buy transaction and the 3 broken sell transactions
DELETE FROM transactions WHERE id IN (
  'fbda6df7-b7bd-4c7e-917f-82e75107d978',
  '2da1ccfb-d90b-4636-9fb2-c3e5e0327d59',
  'b91222a4-8962-469f-86c0-7c9858d33777',
  '8e667e9c-39fc-41d3-8433-bf356e289826'
);

-- 3. Refund the $5 bet amount back to the user
UPDATE balances 
SET amount = amount + 5, updated_at = now()
WHERE user_id = 'cef65e17-6d57-4ce4-8eec-82a0906f9bc5' AND currency = 'USDT';

-- 4. Reset market volume and participants
UPDATE markets 
SET volume = 0, participants = 0
WHERE id = 'e153f4cd-9861-4d94-a04a-ff570c9150ad';

-- 5. Add UPDATE RLS policy on positions so users can update their own positions (needed for sell)
CREATE POLICY "Users can update own positions"
ON public.positions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
