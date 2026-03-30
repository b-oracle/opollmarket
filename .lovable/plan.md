

# Free Market Creation for Unlimited-Markets Creators

## Problem
Verified creators marked with "unlimited markets" (∞) still have to pass the wallet/NFT/BC400 gate check. If they fail, they must pay the creation fee ($50) to bypass. These whitelisted creators should create markets for free with no gate or fee.

## Changes

### 1. Skip gate check entirely for unlimited-markets users
**File**: `src/pages/Create.tsx`

- In the `useEffect` that triggers `runGateCheck` (~line 1315-1319): if `unlimitedMarkets` is true, skip the gate check entirely and set `gatePassed = true` immediately.
- This means unlimited-markets creators never see the wallet/NFT/BC400 checks or the fee bypass prompt.

### 2. Ensure no creation fee is charged during submission
**File**: `src/pages/Create.tsx`

- In the fee calculation (~line 918): when `unlimitedMarkets` is true, force `feeBypass` to be treated as `false` so `creationFeeForDeduction` is 0.
- In the market status logic (~line 963): when `unlimitedMarkets` is true and the market isn't flagged/similar, it should go directly to `active` (not `pending` for review), since `feeBypass` won't be set.
- In the fee transaction recording (~line 1064): skip recording the creation fee transaction when `unlimitedMarkets` is true.

### 3. Hide fee-related UI warnings
**File**: `src/pages/Create.tsx`

- The fee warning text (~line 2807-2811) and the exceeded-free-limit banner (~line 1743) should not appear when `unlimitedMarkets` is true.

### Summary of Logic
```
if (unlimitedMarkets) {
  - Auto-pass gate (no wallet/NFT check)
  - No creation fee
  - No escrow
  - Market goes active directly (unless flagged by similarity)
}
```

### Files Modified
- `src/pages/Create.tsx` — ~5 small conditional changes

