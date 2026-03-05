

## Plan: Add dApp Browser Recommendation Hint on Mobile

**What**: When a user taps "Connect" on a regular mobile browser (Chrome, Safari, Firefox, Opera), show a dismissible tip recommending they open the site in a wallet's built-in browser (MetaMask, Trust Wallet, etc.) for a smoother experience.

**Detection logic**: Check if the user is on mobile (`/iPhone|iPad|Android|Mobile/i` on `navigator.userAgent`) AND no injected wallet provider exists (`!window.ethereum`). If both are true, they're on a normal mobile browser without a dApp browser.

**Implementation** (single file: `src/components/WalletButton.tsx`):

1. Add a `showHint` state, initially `false`.
2. In the not-connected branch, when the user clicks "Connect":
   - If on a normal mobile browser (mobile UA + no `window.ethereum`), set `showHint(true)` and still call `open()` so WalletConnect proceeds.
3. Render a small animated hint banner below the button (or as a toast-like overlay) with:
   - Icon + text: *"For the best experience, open this site in your wallet's built-in browser (MetaMask, Trust Wallet, or any dApp browser)."*
   - A dismiss "×" button to close it.
   - Auto-dismiss after ~10 seconds.
4. The hint only appears once per session (track via state or sessionStorage).

This is a UI-only change, no backend or database modifications needed.

