

## Problem

The **Total Volume** on the Admin Dashboard is incorrect because `marketRows` is fetched with a single query (`supabase.from("markets").select(...)`) which is subject to the **default 1000-row limit**. If there are more than 1000 markets, the volume sum is incomplete.

**Line 95** in `AdminDashboard.tsx`:
```typescript
const { data: marketRows } = await supabase.from("markets").select("category, volume, status, created_at");
```
This returns at most 1000 rows. Then line 202 sums only those rows:
```typescript
const totalVolume = marketRows?.reduce((sum, m) => sum + Number(m.volume), 0) ?? 0;
```

The same issue affects `categoryData` and `statusData` since they also derive from the same truncated `marketRows`.

Additionally, `AdminMarkets.tsx` line 133 has the same pattern — summing volume from a potentially truncated fetch.

## Fix

### 1. `AdminDashboard.tsx` — Batch-fetch all market rows
Replace the single query on line 95 with a batched fetch (same pattern already used for `fetchAllAmounts`), fetching `category, volume, status, created_at` in batches of 1000 until all rows are retrieved.

### 2. `AdminMarkets.tsx` — Batch-fetch all market rows
The `fetchGlobalStats` function fetches markets with `.select("id, status, volume, participants, ...")` which also hits the 1000-row cap. Apply the same batched fetch pattern here.

Both fixes use the existing batch-fetch pattern already in the codebase (e.g., `fetchAllAmounts`), just applying it to the markets table.

