

## Plan: Market Creation Limits for Verified Users

### Summary
Add consecutive active market limits based on verification level: Blue = 5 free markets, Gold = 20 free markets. Once exceeded, verified users must pay the creation fee like unverified users.

### Database Changes
Add two new columns to `commission_settings` to make the limits admin-configurable:
- `blue_max_free_markets` (integer, default 5)
- `gold_max_free_markets` (integer, default 20)

### Logic Changes in `src/pages/Create.tsx`

1. **Fetch user's verification level** from `profiles` table during initial load (alongside commission settings).

2. **Count active markets** created by the user: query `markets` where `creator_wallet = user.id` and `status IN ('active', 'pending')`.

3. **Modify gate logic**: After the token/NFT gate passes, check the active market count against the user's tier limit:
   - If `verification_level === 'blue'` and active markets >= `blue_max_free_markets` → set `feeBypass(true)` (force fee payment)
   - If `verification_level === 'gold'` and active markets >= `gold_max_free_markets` → set `feeBypass(true)`
   - Otherwise → proceed as normal (free creation)

4. **Show UI feedback**: When a verified user has exceeded their limit, display a message like "You've reached your free market limit (5/5). A creation fee of $X applies for additional markets." instead of just silently charging.

### Admin Panel
Update `AdminCommissions.tsx` (or `AdminSettings.tsx`) to expose the two new settings so admins can adjust limits.

### Files to Modify
- **Migration**: Add `blue_max_free_markets` and `gold_max_free_markets` to `commission_settings`
- **`src/pages/Create.tsx`**: Fetch verification level + active market count, enforce limits in gate logic, add exceeded-limit UI messaging
- **Admin settings page**: Add fields for the two new limits

