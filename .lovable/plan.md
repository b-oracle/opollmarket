

## Plan: Isolate Admin-Simulated Stats from Financial Logic and Analytics

### Problem

When admins create markets via the System-Mod Engine, they set simulated `initial_liquidity`, `volume`, and `participants` as display props. However:

1. **Phantom liquidity refunds**: `resolve-market` and `cancel-market` both refund `initial_liquidity` to the creator's balance, even though admin-created markets never actually deducted that money. This creates money from nothing.
2. **Inflated analytics**: `AdminDashboard` sums `market.volume` (which includes simulated volume) into `totalVolume`. `AdminPredictions` also uses market volume/participants data that includes simulated figures.
3. **Inflated participants**: Simulated `participants` count is mixed with real trader counts.

### What Changes

#### 1. New columns on `markets` table to track simulated values separately

Add `simulated_volume` and `simulated_participants` columns (default 0). On admin market creation, store the fake numbers there instead of in `volume` and `participants`. Keep `initial_liquidity` as-is but add a `liquidity_verified` check before refunding.

**Migration:**
```sql
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS simulated_volume numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simulated_participants integer NOT NULL DEFAULT 0;
```

#### 2. Admin market creation — store simulated stats in new columns

**File: `src/pages/admin/AdminCreateMarket.tsx`** and **`src/components/admin/BulkCSVImport.tsx`**

Change the insert to:
- `volume: 0` (real volume starts at 0)
- `participants: 0` (real participants starts at 0)
- `simulated_volume: parseFloat(initialVolume) || 0`
- `simulated_participants: parseInt(initialTraders) || 0`

#### 3. Display: Show combined (real + simulated) in public-facing UI

**File: `src/hooks/useMarkets.ts`** — In `mapDbToMarket`, add simulated values to display totals:
```typescript
volume: Number(db.volume) + Number(db.simulated_volume || 0),
participants: db.participants + (db.simulated_participants || 0),
```

This keeps the public-facing display unchanged (users see propped-up numbers).

#### 4. Fix resolve-market: Only refund verified liquidity

**File: `supabase/functions/resolve-market/index.ts`**

Change the liquidity refund block to check `liquidity_verified`:
```typescript
if (market.initial_liquidity > 0 && market.liquidity_verified) {
```

If `liquidity_verified` is false (admin-simulated, never paid), skip the refund entirely.

#### 5. Fix cancel-market: Same liquidity_verified guard

**File: `supabase/functions/cancel-market/index.ts`**

Same change — only refund initial liquidity when `liquidity_verified === true`.

#### 6. Fix analytics: Exclude simulated stats

**File: `src/pages/admin/AdminDashboard.tsx`**

Change volume calculation to exclude simulated:
```typescript
const totalVolume = marketRows?.reduce((sum, m) => sum + Number(m.volume) - Number(m.simulated_volume || 0), 0) ?? 0;
```

Wait — actually with the new approach, `volume` on the markets table will be real-only (simulated is in the separate column), so existing analytics code that reads `market.volume` will automatically be correct. Only the public display hook adds them together.

#### 7. Backfill existing admin-created markets

Move current fake volume/participants into the new columns for admin-created markets that had simulated stats set. This requires identifying which markets were admin-created with simulated stats.

```sql
-- Backfill: markets created by admin with volume but no matching buy transactions
UPDATE public.markets m
SET simulated_volume = m.volume,
    simulated_participants = m.participants,
    volume = GREATEST(0, m.volume - m.volume),  -- will recalculate from txns
    participants = 0
WHERE m.liquidity_verified = false
  AND m.initial_liquidity > 0
  AND m.volume > 0;
```

Actually a cleaner approach: for each market, calculate real volume from transactions and real participants from positions, then set simulated = total - real.

### Summary of files changed

| File | Change |
|------|--------|
| DB migration | Add `simulated_volume`, `simulated_participants` columns + backfill |
| `src/pages/admin/AdminCreateMarket.tsx` | Store simulated stats in new columns, keep real at 0 |
| `src/components/admin/BulkCSVImport.tsx` | Same |
| `src/hooks/useMarkets.ts` | Add simulated values for public display |
| `supabase/functions/resolve-market/index.ts` | Guard liquidity refund with `liquidity_verified` |
| `supabase/functions/cancel-market/index.ts` | Same guard |

