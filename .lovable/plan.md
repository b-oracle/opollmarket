

# Fix Quick Trade Asset Switching Bugs

## Problem
When users switch between non-crypto markets (Gold, Oil, Silver, Forex), several issues occur: stale price data leaks across assets, interpolation loops persist after switching, and chart data can flash or show incorrect prices momentarily.

## Root Causes

1. **Interpolation interval leak**: `resetInterpolationState()` zeros prices but doesn't stop the running `setInterval`. The timer keeps ticking with zeroed state, causing delays when re-selecting an asset.
2. **Cleanup path split**: The streaming effect has two separate `return` cleanup functions (one for crypto, one for non-crypto). The non-crypto path doesn't clean up crypto-specific resources and vice versa — causes issues when switching between asset classes (e.g., BTC → Gold).
3. **Race condition on fast switches**: HTTP fetches for the previous asset can resolve after switching, and while `isCurrentRun()` guards most paths, the `feedRealPrice` from the global Realtime subscription bypasses this guard entirely.

## Changes

### 1. Fix `resetInterpolationState` in `src/lib/cryptoPriceProvider.ts`
- Stop the running interval and clear the state entry entirely instead of just zeroing prices
- This prevents phantom ticks from a previous asset's interpolation loop

### 2. Unify cleanup in `src/pages/QuickTrade.tsx` streaming effect
- Merge the two separate `return` cleanup blocks into a single unified cleanup function
- Currently lines ~885-895 handle the crypto early-return path, and lines ~898-908 handle the non-crypto path — both need to clean up ALL resources (WS, pollers, interpolation, intervals)
- Use a shared cleanup pattern: declare all unsub/interval variables at the top, clean them all in one return

### 3. Guard `feedRealPrice` in Realtime subscription
- In `ensureRealtimeSubscription`, only call `feedRealPrice` if there are active listeners for that asset
- This prevents the global Realtime stream from feeding stale interpolation states for assets the user isn't viewing

### 4. Add asset guard to price display updates
- In the price display rendering, verify `currentPriceAsset === selectedAsset.symbol` before showing the price
- This prevents a brief flash of the wrong price during async transitions

## Technical Details

**`src/lib/cryptoPriceProvider.ts`** — `resetInterpolationState`:
```typescript
export function resetInterpolationState(asset: string) {
  const state = interpolationStates.get(asset);
  if (state) {
    stopInterpolation(state);
    state.lastRealPrice = 0;
    state.prevRealPrice = 0;
    state.lastRealTime = 0;
    // Don't delete — listeners may still be attached during transition
  }
}
```

**`src/pages/QuickTrade.tsx`** — Unified streaming effect cleanup:
- Move all cleanup variable declarations (`unsubWs`, `unsubPoller`, `unsubSmooth`, `unsubCryptoSmooth`, `cryptoInterpId`, `pollIv`, `pendingRaf`) to the top of the effect
- Single `return () => { ... }` at the bottom that cleans up everything unconditionally

**`src/lib/cryptoPriceProvider.ts`** — Guard `feedRealPrice` in Realtime:
```typescript
// Only feed if there are active listeners
const state = interpolationStates.get(originalSymbol);
if (state && state.listeners.size > 0) {
  feedRealPrice(originalSymbol, price);
}
```

## Files Modified
- `src/lib/cryptoPriceProvider.ts` — Fix interpolation cleanup and Realtime guard
- `src/pages/QuickTrade.tsx` — Unify streaming effect cleanup paths, add price display guard

