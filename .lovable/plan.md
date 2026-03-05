

## Plan: Direct Wallet Connection on Create Page

**Problem**: When a user clicks "Connect Wallet in Profile Settings" on the Creator Verification screen (line 667-673 of `Create.tsx`), it navigates to the profile page instead of prompting wallet connection directly.

**Solution**: Replace the redirect button with an inline wallet connector picker (similar to `WalletButton.tsx`), so users can connect their wallet without leaving the Create page. The component already imports `useConnect` and `connectors` from wagmi.

### Changes

**File: `src/pages/Create.tsx` (lines ~665-674)**

Replace the single "Connect Wallet in Profile Settings" button with:
1. A primary "Connect Wallet" button that toggles a connector list
2. An inline list of available wallet connectors (MetaMask, WalletConnect, etc.) rendered below the button when toggled
3. Use the existing `connect` and `connectors` from the already-imported `useConnect` hook
4. Add a `showConnectors` state variable to toggle the connector list visibility
5. On successful connection, the existing `useEffect` on `isConnected` (line 448-452) will auto-trigger the gate check
6. Keep the wallet address auto-save to profile logic (lines 170-186) so the profile still gets updated

The pattern will mirror the connector selection UI already used in `WalletButton.tsx` but styled to fit the full-width card layout of the gate screen.

