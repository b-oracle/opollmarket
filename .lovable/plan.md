

## Plan: Display Creator Username and Wallet Address on Market Detail Page

The screenshot shows the desired layout: wallet address (truncated, mono font) as the primary line, with `@Username` below it in muted text. The current `CreatorCard` component already has this layout when `walletAddr` exists, but it also needs to handle the case where only a display name is available.

### Current State
The `CreatorCard` in `src/pages/MarketDetail.tsx` (lines 34-69) already fetches `wallet_address` and `display_name` from the profiles table and displays them in the correct format when both are present. When no wallet address exists, it only shows the username.

### Changes

**File: `src/pages/MarketDetail.tsx` — `CreatorCard` component (lines 50-68)**

Update the layout so that:
1. The wallet address is always shown as the primary bold line (truncated). If no wallet address, fall back to truncating the user's UUID (`creatorUserId`) so there's always an address-like identifier displayed.
2. The `@username` is always shown below the address in muted text, using `profile?.display_name` or the `creatorName` prop as fallback.
3. Make the card clickable — tapping navigates to `/user/{creatorUserId}` for the creator's profile page.
4. Fetch `avatar_url` as well to show the creator's actual avatar instead of just an initial.

```text
┌──────────────────────────────────┐
│ [Avatar]  0x8b07...e1b7          │
│           @Agent Debbie          │
└──────────────────────────────────┘
```

### Technical Details

- Update the `select` query to include `avatar_url`
- Always show the truncated address (wallet_address or creatorUserId) on the first line
- Always show `@displayName` on the second line
- Wrap the card in a `Link` or `onClick` handler to navigate to `/user/{creatorUserId}`

