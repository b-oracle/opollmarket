

## Fix Wallet Connection on Create Page

### Problem
The Create page uses `connect({ connector })` directly from wagmi's `useConnect`, which only works when an injected wallet provider is detected in the browser. On normal mobile browsers (no wallet extension), the `connectors` array from `useFilteredConnectors` is empty, so users see a "No wallet detected" message with no actionable button.

The Profile page works because it uses `open()` from `useAppKit()`, which opens the Reown/WalletConnect modal — this works universally (shows QR code on desktop, deep links on mobile).

### Fix
Update the Create page's wallet connection section to match the Profile page pattern:

**`src/pages/Create.tsx`** — two changes:

1. **Import `useAppKit`**: Add `import { useAppKit } from "@reown/appkit/react";` and call `const { open } = useAppKit();` inside the component.

2. **Replace the connector-based connect buttons** (lines ~928-967) with the same pattern used on Profile:
   - When `connectors.length > 0` (injected wallet detected): show a single "Connect Wallet" button that calls `open()` instead of iterating connectors with `connect({ connector })`
   - When no connectors detected: also show a "Connect Wallet" button that calls `open()` (the Reown modal handles WalletConnect QR/deep-links), plus keep the wallet app badges as informational hints
   - Remove the "No wallet detected" dead-end message

This ensures the Create page wallet connection works identically to the Profile page on all devices.

