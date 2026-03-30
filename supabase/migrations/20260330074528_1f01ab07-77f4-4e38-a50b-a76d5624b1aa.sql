
-- Clawback overpayment from Elon Musk tweet market e153f4cd-9861-4d94-a04a-ff570c9150ad
-- Total paid out: $379.69, correct pool-proportional total: $218.73, excess: $160.96
-- payoutPerShare should have been: 218.73 / 379.69 = 0.5761

-- Recalculate correct payouts and debit the excess from each winner
DO $$
DECLARE
  _market_id uuid := 'e153f4cd-9861-4d94-a04a-ff570c9150ad';
  _total_pool numeric;
  _total_winner_shares numeric;
  _payout_per_share numeric;
  _rec record;
  _correct_payout numeric;
  _excess numeric;
BEGIN
  -- Calculate total pool from all positions
  SELECT COALESCE(SUM(shares * avg_price), 0) INTO _total_pool
  FROM positions WHERE market_id = _market_id AND shares > 0;

  -- Get winning option
  -- winning_option_id from the market
  SELECT COALESCE(SUM(p.shares), 0) INTO _total_winner_shares
  FROM positions p
  JOIN markets m ON m.id = p.market_id
  WHERE p.market_id = _market_id AND p.option_id = m.winning_option_id AND p.shares > 0;

  IF _total_winner_shares <= 0 THEN
    RAISE NOTICE 'No winner shares found, skipping';
    RETURN;
  END IF;

  _payout_per_share := LEAST(1.0, _total_pool / _total_winner_shares);
  RAISE NOTICE 'Pool: %, Winner shares: %, Rate: %', _total_pool, _total_winner_shares, _payout_per_share;

  -- For each payout transaction, calculate excess and debit
  FOR _rec IN
    SELECT t.id, t.user_id, t.amount as paid, t.shares,
           ROUND((t.shares * _payout_per_share)::numeric, 2) as correct_amount
    FROM transactions t
    WHERE t.market_id = _market_id AND t.type = 'payout' AND t.status = 'confirmed'
  LOOP
    _correct_payout := _rec.correct_amount;
    _excess := ROUND((_rec.paid - _correct_payout)::numeric, 2);
    
    IF _excess > 0 THEN
      -- Debit excess from user balance
      UPDATE balances SET amount = GREATEST(0, amount - _excess), updated_at = now()
      WHERE user_id = _rec.user_id AND currency = 'USDT';

      -- Record the clawback as a transaction
      INSERT INTO transactions (user_id, market_id, type, amount, status, side)
      VALUES (_rec.user_id, _market_id, 'refund', -_excess, 'confirmed', 'overpayment_clawback');

      -- Update original payout transaction amount to the correct value
      UPDATE transactions SET amount = _correct_payout, price = _payout_per_share WHERE id = _rec.id;

      RAISE NOTICE 'User %: paid %, correct %, clawed back %', _rec.user_id, _rec.paid, _correct_payout, _excess;
    END IF;
  END LOOP;
END $$;
