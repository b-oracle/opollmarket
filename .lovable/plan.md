

# Pause Round Duration Switch & Timer When Market is Closed

## Problem
When a forex/commodity market is closed, the round duration selector and countdown timer still display as if the market is active — showing "0:00" or "Resolving..." instead of indicating the market is paused.

## Changes

### File: `src/pages/QuickTrade.tsx`

**1. Round Duration selector (lines 1229-1249):** Add `disabled` styling and prevent switching when market is closed. Wrap buttons with a check for `isMarketOpen(selectedAsset.assetClass)` — if closed, disable clicks and dim the buttons.

**2. Countdown display (lines 1272-1285):** When market is closed, replace the timer and status label with a "Market Closed" / moon icon display instead of showing "0:00 / Resolving...". Something like:

```
<Moon className="w-5 h-5 text-muted-foreground" />
<span className="text-sm text-muted-foreground">Closed</span>
```

**3. Round fetching/creation (around line 830-870):** Guard the `findOrCreateRound` logic so it does not create new rounds when the market is closed. This prevents phantom rounds from being created for closed markets.

These are all localized UI/logic changes in `QuickTrade.tsx` with no risk to open-market behavior.

