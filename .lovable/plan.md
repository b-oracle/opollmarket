

# Add Liquidity Top-Up for Market Creators

## Overview
Allow market creators to add more liquidity to their existing active markets from the market detail page. An "Add Liquidity" button appears only for the creator, opening a modal to specify the amount. The funds are deducted from their balance and added to the market's liquidity pool.

## Changes

### 1. New `AddLiquidityModal` component (`src/components/AddLiquidityModal.tsx`)
- Simple modal with amount input, balance display, and confirm button
- Calls `deduct_market_liquidity` RPC (already exists) with `_fee_amount: 0` and `_bonus_for_fee: 0` (no fee for top-ups)
- On success: updates `markets.liquidity` and `markets.initial_liquidity` (increment both via a new RPC or direct update since creators can update own markets)
- Inserts a transaction record with `type: "buy"`, `side: "initial_liquidity"`
- Invalidates `["market", id]` and `["balance"]` queries

### 2. New RPC: `add_market_liquidity` (database migration)
Atomic function that:
1. Deducts `_amount` from user's balance (with `FOR UPDATE` lock)
2. Increments `markets.initial_liquidity` and `markets.liquidity` by `_amount`
3. Inserts the transaction record
4. Returns success/error

This is safer than client-side multi-step updates. Uses `SECURITY DEFINER` like existing financial RPCs.

### 3. Update `MarketDetail.tsx`
- Import and render `AddLiquidityModal`
- Show "Add Liquidity" button in the stats grid (next to the Liquidity stat) only when `isCreator && !isEnded`
- Button opens the modal with `marketId` and current liquidity info

## Technical Details

**Migration SQL:**
```sql
CREATE OR REPLACE FUNCTION public.add_market_liquidity(
  _user_id uuid,
  _market_id uuid,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _bal numeric;
BEGIN
  SELECT amount INTO _bal FROM balances WHERE user_id = _user_id FOR UPDATE;
  IF _bal IS NULL OR _bal < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  -- Verify market ownership
  IF NOT EXISTS (SELECT 1 FROM markets WHERE id = _market_id AND creator_wallet = _user_id::text AND status IN ('active','ended')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your market or invalid status');
  END IF;
  UPDATE balances SET amount = amount - _amount, updated_at = now() WHERE user_id = _user_id;
  UPDATE markets SET initial_liquidity = initial_liquidity + _amount, liquidity = liquidity + _amount, updated_at = now() WHERE id = _market_id;
  INSERT INTO transactions (user_id, type, amount, market_id, status, side) VALUES (_user_id, 'buy', _amount, _market_id, 'confirmed', 'initial_liquidity');
  RETURN jsonb_build_object('success', true);
END;
$$;
```

**UI placement:** The Liquidity stat card gets a small "+" button when the user is the creator. Tapping it opens the AddLiquidityModal.

