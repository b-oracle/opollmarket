

## Plan: Add Database Trigger to Validate Market Liquidity Deduction

### Problem
Markets can be created without a matching `initial_liquidity` deduction transaction, as seen with BOracle's two legacy markets. The deduction happens client-side after market insert, so if it fails silently, no safeguard catches it.

### Solution
Create a **deferred validation trigger** on the `markets` table that fires after insert and checks that a matching transaction exists. Since the liquidity transaction is inserted *after* the market row (same client flow), we need a **constraint trigger deferred to end of transaction** — but since the market insert and transaction insert happen in separate Supabase client calls (not a single DB transaction), a trigger won't reliably see the transaction row.

**Better approach**: A **scheduled validation function** that runs periodically and flags/blocks markets missing their liquidity transaction, OR we restructure the flow.

**Recommended approach**: Create a validation trigger on `markets` that fires on INSERT and prevents creation when `initial_liquidity > 0` unless the creator's balance was already deducted via the `deduct_market_liquidity` RPC. Since the RPC runs *before* market insert in the client code (line ~530), we can verify the deduction happened by checking the user's balance was reduced. However, the cleanest server-side enforcement is:

**A trigger that marks markets needing verification**, combined with a periodic check:

1. **Add a `liquidity_verified` column** (boolean, default false) to `markets`
2. **Create a trigger function** that runs every few minutes (or on-demand) to verify each unverified market with `initial_liquidity > 0` has a matching `initial_liquidity` transaction, and flags those that don't
3. **Admin notification** for unverified markets after a grace period

Actually, the simplest effective approach given the current flow (deduct RPC runs before insert, transaction recorded after):

### Final Approach: Validation Trigger on Transaction Insert

Create a trigger on the `transactions` table that, when an `initial_liquidity` transaction is inserted, sets a `liquidity_verified` flag on the market. Then add a **scheduled check** that catches any market with `initial_liquidity > 0` that remains unverified after 5 minutes.

### Implementation

**Database Migration:**

1. Add `liquidity_verified boolean DEFAULT false` column to `markets`
2. Create trigger function `verify_market_liquidity()` on `transactions` INSERT — when `side = 'initial_liquidity'`, update `markets SET liquidity_verified = true WHERE id = NEW.market_id`
3. Create trigger function `check_unverified_liquidity()` — callable via RPC or cron — that finds markets where `initial_liquidity > 0 AND liquidity_verified = false AND created_at < now() - interval '5 minutes'` and notifies admins

**No frontend changes needed** — this is purely backend enforcement.

### SQL

```sql
-- 1. Add verification flag
ALTER TABLE public.markets ADD COLUMN liquidity_verified boolean NOT NULL DEFAULT false;

-- 2. Auto-verify when liquidity transaction is recorded
CREATE OR REPLACE FUNCTION public.verify_market_liquidity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.side = 'initial_liquidity' AND NEW.status = 'confirmed' AND NEW.market_id IS NOT NULL THEN
    UPDATE public.markets SET liquidity_verified = true WHERE id = NEW.market_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_verify_market_liquidity
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.verify_market_liquidity();

-- 3. Flag unverified markets (admin-callable RPC)
CREATE OR REPLACE FUNCTION public.flag_unverified_liquidity()
RETURNS TABLE(market_id uuid, title text, creator_wallet text, initial_liquidity numeric, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, title, creator_wallet, initial_liquidity, created_at
  FROM public.markets
  WHERE initial_liquidity > 0
    AND liquidity_verified = false
    AND created_at < now() - interval '5 minutes'
    AND status != 'cancelled';
$$;

-- 4. Backfill existing verified markets
UPDATE public.markets m SET liquidity_verified = true
WHERE initial_liquidity > 0
  AND EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.market_id = m.id AND t.side = 'initial_liquidity' AND t.status = 'confirmed'
  );
```

This ensures every future market with liquidity gets automatically verified when the transaction is recorded, and any that slip through are easily caught via the `flag_unverified_liquidity()` function.

