
-- Fix double-correction: restore original payout amounts (shares * $1) 
-- and keep clawback records as the actual balance adjustment
-- This way: net_payout = original_payout + clawback = correct amount
UPDATE transactions 
SET amount = shares, price = 1
WHERE market_id = 'e153f4cd-9861-4d94-a04a-ff570c9150ad' 
  AND type = 'payout' 
  AND status = 'confirmed'
  AND shares IS NOT NULL;
