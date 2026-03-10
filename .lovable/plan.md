

## Plan: Show Connect Wallet Button in DApp Browsers

**Problem**: When users open the Profile page inside a wallet's built-in browser (MetaMask, Trust Wallet, Binance, etc.), the wallet section shows a static "No wallet linked" message with informational badges instead of an actionable "Connect Wallet" button -- even though `window.ethereum` is available and the `useFilteredConnectors` hook already detects these connectors.

**Solution**: Update the "no wallet" state (lines 1086-1117 in `Profile.tsx`) to check if injected wallet connectors are detected. If yes, show a "Connect Wallet" button (using the existing `connect`/`connectors` from `useFilteredConnectors`). If no connectors are found, fall back to the current informational message.

### Changes in `src/pages/Profile.tsx`

Replace the static "No wallet linked" block with:

1. **Check `connectors.length > 0`** -- if injected/WalletConnect connectors are available:
   - Show a "Connect Wallet" button that calls `open()` from AppKit (same as `WalletButton.tsx` pattern)
   - Display detected connector names as chips below
2. **Else** (no wallet detected -- e.g. regular mobile Safari):
   - Keep the current informational message with wallet browser deep links (MetaMask, Trust Wallet, SafePal, Coinbase, Binance)

This uses the existing `useAppKit` import pattern from `WalletButton.tsx` -- calling `open()` to trigger the Reown AppKit modal, which handles the full connection flow.

**Files to edit**: `src/pages/Profile.tsx` only (lines ~1085-1118)

