

## Plan: Auth-First Market Creation Flow

### Current State
The Create page currently only checks for wallet connection and token-gates (BC400 tokens/NFT). There's no authentication requirement — users can attempt to create markets without being signed in. The `creator_wallet` field stores the blockchain address, not the user ID.

### Proposed Flow
1. **Step 1 — Sign In Required**: If not authenticated, show a sign-in prompt redirecting to `/auth`
2. **Step 2 — Connect Wallet**: Once signed in, prompt wallet connection (wallet gets associated with the user's account/profile)
3. **Step 3 — Token Gate Check**: Verify BC400 token/NFT holdings via connected wallet
4. **Step 4 — Market Creation Form**: Proceed to the existing form

### Changes

**`src/pages/Create.tsx`**
- Import `useAuth` hook
- Add auth check as the first gate: if `!user && !loading`, render a "Sign in to create markets" screen with a button navigating to `/auth`
- When wallet connects successfully, save the wallet address to the user's profile (`profiles.wallet_address`) if not already set
- Update `handleCreateMarket` to use `user.id` as `creator_wallet` instead of the blockchain `address`, so the market is tied to the authenticated account
- Restructure the gate screen to show three sequential steps: Account → Wallet → Token Verification
- Keep all existing token-gate logic intact, just nested under the auth requirement

**`src/hooks/useAuth.ts`**
- No changes needed — already provides `user`, `loading`, and `session`

### Technical Details
- The `markets.creator_wallet` column currently stores wallet addresses; it will now store the user's auth ID (already a text field, so UUID strings work)
- The RLS policy `(auth.uid())::text = creator_wallet` already expects this pattern, so storing `user.id` is actually the correct approach for RLS compliance
- Profile wallet association: on wallet connect, upsert `profiles.wallet_address` with the connected address so it's linked to the account

