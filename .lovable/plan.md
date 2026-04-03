

## Transfer Rewards to Gift Balance

### Overview
Add a "Convert to Gifts" action on the Rewards Balance card in the SpaceRoom stats panel, plus a new database RPC to securely move funds from `rewards_balance` to `gift_balance`.

### Database Migration

Create RPC `transfer_rewards_to_gift(_user_id uuid, _amount numeric) RETURNS jsonb`:
- `SECURITY DEFINER` with `auth.uid()` enforcement (same pattern as `topup_gift_balance`)
- Validates `_amount > 0`
- Locks the balance row `FOR UPDATE`
- Checks `rewards_balance >= _amount`
- Deducts from `rewards_balance`, adds to `gift_balance`
- Returns `{ success: true, remaining_rewards, new_gift_balance }`

### Frontend Changes

**`src/components/social/SpaceRoom.tsx`**

1. Add state: `showRewardsTransfer` (boolean), `transferAmount` (string), `transferring` (boolean)
2. On the Rewards Balance card (line ~2907-2912), add a "Convert" button below the balance (same style as the "Top Up" button on the Gift Balance card)
3. When tapped, show a small inline form (or swap the card content):
   - Input for amount (pre-filled with full rewards balance)
   - "Convert to Gift Balance" button
   - Calls `supabase.rpc("transfer_rewards_to_gift", { _user_id: user.id, _amount: amt })`
   - On success: refresh balances, toast confirmation
   - On error: toast error message

**`src/pages/Commissions.tsx`**

4. Add a third action button "Convert to Gifts" alongside "Top Up" and "Withdraw" in the gift balance breakdown section (~line 741-753)
5. Add a `giftAction === "convert"` state that shows a similar form transferring rewards→gift balance using the same RPC

### Security
- RPC enforces `auth.uid() = _user_id` server-side
- `FOR UPDATE` row lock prevents race conditions
- No new RLS policies needed (RPC is `SECURITY DEFINER`)

