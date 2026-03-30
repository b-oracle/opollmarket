

# Fix: Show Option Selector on First Prediction for Range/Multi Markets

## Problem
When a range or multi-option market is created, the "Place Your First Prediction" step does not show the options to pick from. The creator only sees the amount input. This happens because `newMarketOptions` state may be empty if the `.select()` after inserting options fails silently or the state doesn't populate in time.

## Root Cause
In `src/pages/Create.tsx` (~line 2982), the option list renders only when `newMarketOptions.length > 0`. If the array is empty (e.g. insert didn't return data, or a subtle race), the UI falls through to `null` — no selector at all. The creator can then submit a prediction without an `optionId`, which the backend now rejects (400 error).

## Fix

### File: `src/pages/Create.tsx`

1. **Add a fallback fetch** — When `submitStep` transitions to `"first_prediction"` and `marketType !== "binary"` but `newMarketOptions` is empty, fetch options from the `market_options` table using `newMarketId`. Add a `useEffect` that triggers on `[submitStep, newMarketId, marketType]`.

2. **Disable the submit button** when it's a multi/range market and no option is selected (`!firstPredOptionId`). Currently the button is always enabled, allowing a submission that will fail.

3. **Show a loading state** while options are being fetched, so the creator doesn't see a bare form.

### Changes Summary
- ~15 lines: new `useEffect` to fetch options as fallback
- ~2 lines: disable submit button when no option selected for non-binary markets
- No backend changes needed

