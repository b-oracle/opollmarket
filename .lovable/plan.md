

## Plan: Update Liquidity = Initial Liquidity + Total Wagered

The user wants "Liquidity" across the platform to reflect `initial_liquidity + volume` (where volume = total wagered) rather than just the raw `liquidity` column value.

### Approach

**Option A (DB migration):** Update the `liquidity` column in the `markets` table for all existing markets to `initial_liquidity + volume`, and update `place-bet` to keep it in sync going forward.

**Option B (Display-only):** Compute liquidity as `initial_liquidity + volume` at display time across all relevant components, without changing the DB column.

I'll go with **Option A** — update the DB and keep it in sync, since the `liquidity` column is already used by the OrderBook component for depth calculations.

### Changes

#### 1. Database Migration
- `UPDATE markets SET liquidity = initial_liquidity + volume;` — backfill all existing markets.
- This ensures the `liquidity` column always equals `initial_liquidity + total wagered`.

#### 2. `supabase/functions/place-bet/index.ts`
- When updating market after a bet, also update `liquidity` to `initial_liquidity + new volume`. Currently only `volume` is incremented. Add `liquidity: Number(mkt.volume) + poolAmount + initialLiquidity` (need to fetch `initial_liquidity` in the select).

#### 3. `src/pages/Portfolio.tsx`
- The sell/exit-fee logic updates `liquidity` — ensure it stays consistent with the new formula (or remove the liquidity update there since liquidity should track `initial_liquidity + volume`).

#### 4. `src/pages/admin/AdminPredictions.tsx`
- Update the "Total Liquidity" card to show `totalLiquidity + totalWagered` (initial liquidity deposits + all wagered amounts) instead of just initial liquidity deposits.

#### 5. `src/pages/admin/AdminDashboard.tsx`
- The `totalVolume` calculated from `marketRows` already sums `volume`. No liquidity card exists here, so no change needed unless there's a relevant card.

#### 6. Display components (MarketDetail, MarketCard, OrderBook)
- These already read `market.liquidity` from the DB, so once the DB is correct they'll display correctly automatically. No code changes needed.

### Summary

| File | Change |
|------|--------|
| DB Migration | Backfill `liquidity = initial_liquidity + volume` for all markets |
| `place-bet/index.ts` | Fetch `initial_liquidity`, set `liquidity = initial_liquidity + newVolume` on each bet |
| `Portfolio.tsx` | Update exit-fee liquidity update to maintain consistency |
| `AdminPredictions.tsx` | Show liquidity as `initialLiquidity + totalWagered` |

