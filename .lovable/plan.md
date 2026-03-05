

## Problem

The wagmi config (`src/lib/wagmi.ts`) has `connectors: []` — an empty array. This means `useConnect().connectors` returns nothing, so when the user clicks "Connect Wallet" and the connector list expands, it's empty.

## Solution

Add the `injected` connector (for MetaMask/browser wallets) to the wagmi config. This is the only connector that works without a WalletConnect project ID.

### Changes

**File: `src/lib/wagmi.ts`**
- Import `injected` from `wagmi/connectors`
- Add `injected()` to the `connectors` array

**File: `src/pages/Create.tsx`**
- Add a fallback message when `connectors.length === 0` (e.g., "No wallets detected. Please install MetaMask.")
- This prevents a blank panel if no browser wallet is installed

