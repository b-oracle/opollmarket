

## Add "Convert to Gift Balance" Option in Withdraw Flow

### What changes

**Database Migration** — Create RPC `transfer_rewards_to_gift`
- Parameters: `_user_id uuid`, `_amount numeric`
- `SECURITY DEFINER`, enforces `auth.uid() = _user_id`
- Locks balances row `FOR UPDATE`, validates `rewards_balance >= _amount`
- Deducts from `rewards_balance`, adds to `gift_balance`
- Returns `jsonb { success, remaining_rewards, new_gift_balance }`

**`src/pages/Commissions.tsx`** — Modify the withdraw flow

Currently the "Withdraw" button only transfers rewards → main balance. Change it to present a destination choice:

1. Replace `giftAction === "withdraw"` view with a two-step flow:
   - First show destination picker: **"To Main Balance"** and **"To Gift Balance"** as two buttons
   - Then show the amount input + confirm button based on selection

2. Add state: `withdrawDest: "main" | "gift" | null`

3. When dest is `"main"` — use existing `withdraw_rewards_balance` RPC (no change)
4. When dest is `"gift"` — call new `transfer_rewards_to_gift` RPC

### UX Result
```text
Gift Balance Details
┌──────────────────────────────┐
│ Total Balance         $1.10  │
│ Available to Send     $0.55  │
│ Gifts Received        $0.55  │
├──────────────────────────────┤
│  [Top Up]    [Withdraw]      │
└──────────────────────────────┘

After tapping Withdraw:
┌──────────────────────────────┐
│ Where to transfer?           │
│                              │
│ [💰 Main Balance]            │
│ [🎁 Gift Balance]            │
│                              │
│ [← Back]                     │
└──────────────────────────────┘

After selecting destination:
┌──────────────────────────────┐
│ Transfer to Gift Balance     │
│ Available: $0.55             │
│ [Amount input]               │
│ [Back]  [Transfer]           │
└──────────────────────────────┘
```

### No other file changes needed

