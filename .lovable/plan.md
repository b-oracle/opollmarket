

## Plan: Always Show Creator Username (Not Wallet Address) on Market Cards

### Problem
The `creatorLabel` on line 92-94 of `MarketCard.tsx` currently prioritizes showing a truncated wallet address when the profile has one, and only falls back to `@creatorName`. This causes inconsistency — some cards show wallet addresses, others show usernames.

### Fix

**File: `src/components/MarketCard.tsx`**

1. **Update the profile query** (line 84) to also fetch `display_name`:
   ```ts
   .select("wallet_address, avatar_url, verification_level, display_name")
   ```

2. **Replace the `creatorLabel` logic** (lines 92-94) to always use the display name:
   ```ts
   const creatorLabel = creatorProfile?.display_name
     ? `@${creatorProfile.display_name}`
     : `@${market.creatorName}`;
   ```

3. **Remove the conditional `font-mono` class** on line 464 since we no longer show wallet addresses:
   ```tsx
   <span className="text-xs font-medium text-foreground/80 truncate group-hover/creator:underline">{creatorLabel}</span>
   ```

No other files need changes. The verification badge (blue tick) is already rendered on line 465-467 via `NftBadge`.

