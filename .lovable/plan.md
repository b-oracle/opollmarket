

## Diagnosis: Quick Trade Page Refresh Loop

### Root Cause

The Realtime subscription at line 1100 listens to **all** changes on `quick_rounds` with `event: "*"` and **no filter**. Every insert, update, or delete on this table (from any user, any asset, any timeframe) triggers `fetchActiveRound()`.

`fetchActiveRound()` itself can **create a new round** (line 972) if none exists. That insert fires another Realtime event, which calls `fetchActiveRound()` again — creating a feedback loop.

Additionally, other users placing trades or rounds resolving across all assets cause constant re-fetching, leading to the continuous "refreshing" behavior.

### Fix

1. **Filter the Realtime subscription** to only react to changes relevant to the current asset. Use a Postgres Realtime filter:
   ```
   filter: `asset=eq.${selectedAsset.symbol}`
   ```
   This dramatically reduces spurious triggers.

2. **Debounce `fetchActiveRound` calls** from the Realtime handler. Add a simple timestamp guard (e.g., skip if called within the last 2 seconds) to prevent rapid cascading fetches.

3. **Separate the "create round" logic** from the fetch path in the Realtime handler. The Realtime callback should only **fetch** existing rounds, never create new ones. Round creation should only happen on initial mount and asset/timeframe changes.

### Files Changed
- `src/pages/QuickTrade.tsx` — Update the Realtime `useEffect` (lines 1100-1150) to add an asset filter and debounce, and guard against round creation in the Realtime callback path.

### Technical Detail

```text
Current flow (broken):
  Realtime event (any asset) → fetchActiveRound() → no round found → INSERT new round → Realtime event → loop

Fixed flow:
  Realtime event (filtered to current asset) → debounced fetch (SELECT only) → update state
  Round creation only on: mount, asset change, timeframe change
```

