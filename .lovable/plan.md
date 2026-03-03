

## Commission System for Predictions

### Overview
When a user places a prediction, the bet amount will be split into three parts:
1. **Admin commission** (X%) — credited instantly to admin's balance
2. **Market creator commission** (X%) — credited instantly to creator's balance
3. **Pool** (remaining %) — stays as the effective bet amount

The admin configures these percentages from a new **Commission Settings** page in the admin panel.

### Database Changes

**New table: `commission_settings`**
- `id` (uuid, PK)
- `admin_fee_percent` (numeric, default 2)
- `creator_fee_percent` (numeric, default 3)
- `updated_at` (timestamptz)
- `updated_by` (uuid)
- RLS: admins can read/update, authenticated users can read (needed at bet time)
- Seeded with one default row

### Code Changes

1. **New admin page: `src/pages/admin/AdminSettings.tsx`**
   - Fetches the single row from `commission_settings`
   - Two numeric inputs: Admin Fee % and Creator Fee %
   - Validates total doesn't exceed 100%, shows remaining pool %
   - Save button updates the row

2. **Admin layout update (`AdminLayout.tsx`)**
   - Add "Settings" nav item with a Settings icon
   - Route: `/admin/settings`

3. **App.tsx** — Add the new route under AdminLayout

4. **Update `usePlaceBet` hook (`useUserBalance.ts`)**
   - Fetch `commission_settings` before processing bet
   - Fetch market's `creator_wallet` to find the creator's user profile/balance
   - Calculate: `adminAmount = amount * adminFee%`, `creatorAmount = amount * creatorFee%`, `poolAmount = amount - adminAmount - creatorAmount`
   - Credit admin balance (look up admin user via `user_roles` where role = 'admin')
   - Credit creator balance (look up creator via `profiles.wallet_address` matching `markets.creator_wallet`, or use creator's user_id if available)
   - Deduct `totalCost` (poolAmount + fee) from user's balance — or keep existing 2% platform fee as the admin fee from settings
   - Record the bet with `poolAmount` as the effective amount
   - Insert commission transactions for admin and creator with type `commission`

5. **Update `BetModal.tsx`**
   - Fetch commission settings to show the fee breakdown (admin %, creator %, pool %) in the order summary
   - Replace hardcoded 2% fee with dynamic commission rates

### Technical Details

- The `commission_settings` table will have exactly one row (singleton pattern)
- Creator identification: match `markets.creator_wallet` to `profiles.wallet_address` to find the creator's `user_id`, then credit their balance
- If creator has no balance row yet, insert one
- Admin identification: query `user_roles` for role='admin', take first result
- Commission transactions recorded with `type: 'commission'` for audit trail

