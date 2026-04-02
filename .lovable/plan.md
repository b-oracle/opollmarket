

## Spaces Emoji Gifting System

### Concept
Transform the existing targeted emoji feature into a TikTok-style gifting system. Each emoji has a price. Sending an emoji deducts from the sender's **gift balance** and credits the recipient. Users must top up their gift balance to send gifts.

### New Balances on Commissions Page
Add 3 balance cards at the top of the Commissions page:
1. **Gift Balance** — dedicated balance for sending emoji gifts in Spaces (top-up from main balance)
2. **Bonus Balance** — existing bonus balance (already tracked in `balances.bonus_balance`)
3. **Rewards Balance** — accumulated gifts received from other users in Spaces

### Database Changes

**1. Add `gift_balance` and `rewards_balance` columns to `balances` table:**
```sql
ALTER TABLE balances ADD COLUMN gift_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE balances ADD COLUMN rewards_balance numeric NOT NULL DEFAULT 0;
```

**2. Create `space_gifts` table to log gift transactions:**
```sql
CREATE TABLE space_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  space_id uuid NOT NULL,
  emoji text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE space_gifts ENABLE ROW LEVEL SECURITY;
-- Users can read their own sent/received gifts
CREATE POLICY "Users can read own gifts" ON space_gifts FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
-- Admins can read all
CREATE POLICY "Admins can read all gifts" ON space_gifts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
```

**3. Create `send_space_gift` RPC (SECURITY DEFINER):**
- Validates sender has sufficient gift_balance
- Deducts from sender's gift_balance
- Credits recipient's rewards_balance
- Inserts record into space_gifts
- Returns success/error

**4. Create `topup_gift_balance` RPC (SECURITY DEFINER):**
- Deducts from main balance, adds to gift_balance

### Emoji Pricing
Define emoji prices in a constant (configurable later via commission_settings):

| Emoji | Price |
|-------|-------|
| 🔥    | $0.10 |
| 👏    | $0.10 |
| 👍    | $0.05 |
| ❤️    | $0.25 |
| 😂    | $0.05 |
| 💯    | $0.50 |
| 🎯    | $1.00 |

### UI Changes

**File: `src/components/social/SpaceRoom.tsx`**
1. Update emoji picker to show price next to each emoji
2. Modify `sendTargetedEmoji` to call `send_space_gift` RPC instead of just broadcasting
3. If insufficient gift balance, show toast with "Top up your gift balance" and disable sending
4. Fetch user's gift_balance on mount and keep it updated after each send
5. Show gift balance at top of emoji picker overlay
6. Update notification message: "[Name] sent you ❤️ ($0.25)"

**File: `src/pages/Commissions.tsx`**
1. Fetch `gift_balance`, `bonus_balance`, `rewards_balance` from balances table
2. Add a "Balances" section above the summary cards with 3 cards:
   - Gift Balance (with "Top Up" button)
   - Bonus Balance
   - Rewards Balance (with "Withdraw to Main" button)
3. "Top Up" opens a small modal to transfer from main → gift balance
4. "Withdraw to Main" calls an RPC to move rewards → main balance

**File: `src/hooks/useUserBalance.ts`**
- Add `giftBalance` and `rewardsBalance` to the returned object

### Edge Function: `send-space-gift/index.ts`
Alternative to RPC — an edge function that:
- Validates JWT
- Calls the `send_space_gift` database function
- Sends push notification to recipient
- Returns updated gift balance

This approach is better since we already need to send a push notification, keeping it atomic.

### Files to modify
1. **Database migration** — add columns + table + RPCs
2. **`src/components/social/SpaceRoom.tsx`** — priced emoji picker, gift deduction
3. **`src/pages/Commissions.tsx`** — 3 new balance cards
4. **`src/hooks/useUserBalance.ts`** — expose new balances
5. **`supabase/functions/send-space-gift/index.ts`** — new edge function for atomic gift + notification

