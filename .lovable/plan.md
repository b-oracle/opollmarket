

## Plan: Link Wallet to Email Account

The `profiles` table already has a `wallet_address` column. The wallet connectors (MetaMask, WalletConnect) are already available via wagmi. We just need to wire them together so that when an authenticated user connects a wallet, it saves to their profile.

### Changes

1. **Remove wallet connectors from `Auth.tsx`**
   - Delete the wallet connect section from the auth page since wallets won't be used for registration
   - Remove wagmi imports from Auth.tsx

2. **Add "Link Wallet" feature to `Profile.tsx`**
   - Add a section showing the user's linked wallet address (from `profiles.wallet_address`)
   - Add a "Connect Wallet" button using wagmi's `useConnect` hook
   - When a wallet is connected, save the address to `profiles.wallet_address` via Supabase update
   - Show a "Disconnect" option that clears the wallet address from the profile
   - Display the linked wallet address with a truncated format and copy button

3. **Fetch wallet address in profile query**
   - Ensure the profile query in Profile.tsx includes `wallet_address`
   - Use wagmi's `useAccount` to detect active wallet connection and auto-link if profile has no wallet yet

### Files to modify
- `src/pages/Auth.tsx` — remove wallet connector buttons and wagmi imports
- `src/pages/Profile.tsx` — add wallet linking UI section

