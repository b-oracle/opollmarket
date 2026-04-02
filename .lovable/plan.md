

## Merge Gift + Rewards into Single "Gift Balance" Card & Add Revenue Share Card

### What changes

**1. Combine Gift Balance and Rewards Balance into one card**

The "Gift Balance" card will show the combined total of `gift_balance + rewards_balance`. Tapping the card opens a detail sheet/dialog showing:
- **Total Gift Balance**: combined figure
- **Available to Send**: current `gift_balance`
- **Gifts Received**: current `rewards_balance`
- **Top Up** button (transfers from main → gift_balance)
- **Withdraw** button (transfers rewards_balance → main balance)

The separate "Rewards" card is removed.

**2. Replace "Rewards" card with "Revenue Share"**

A new "Revenue Share" card shows the user's accumulated revenue share earnings (for Blue/Gold verified creators). This queries `pending_commissions` where `type = 'revenue_share'` or a similar identifier, summing released amounts. If the user has no revenue share earnings, it shows $0.00.

### Files to modify

**`src/pages/Commissions.tsx`**
- Remove the third "Rewards" balance card
- Update the "Gift Balance" card to show `giftBalance + rewardsBalance` as the displayed total
- Make the Gift Balance card clickable — opens a new dialog showing sent vs received breakdown with Top Up and Withdraw actions
- Add a "Revenue Share" card in the third slot, pulling data from `pending_commissions` where `type = 'revenue_share'` (or from a dedicated query)
- Move the Top Up and Withdraw modals into the new Gift detail dialog
- Remove `withdrawOpen` / `withdrawAmount` state (folded into gift detail dialog)

**`src/hooks/useUserBalance.ts`**
- Keep exposing `giftBalance` and `rewardsBalance` separately (the Commissions page needs both for the breakdown)
- Add a computed `totalGiftBalance: giftBalance + rewardsBalance`

### UI layout (balance cards row)

```text
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   🎁 $X.XX   │  │   ✨ $X.XX   │  │   💎 $X.XX   │
│ Gift Balance  │  │ Bonus Balance│  │ Revenue Share │
│   [tap ▸]     │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Gift Balance detail dialog (on tap)

```text
┌─────────────────────────────┐
│     Gift Balance Details     │
│                              │
│  Total:     $X.XX            │
│  To Send:   $X.XX            │
│  Received:  $X.XX            │
│                              │
│  [Top Up]   [Withdraw]       │
└─────────────────────────────┘
```

### Technical detail

- Revenue share data: query `pending_commissions` filtered by `type = 'revenue_share'`, sum the amounts. This aligns with the existing revenue share bonus system that credits verified creators upon market resolution.
- The `totalGiftBalance` convenience field in `useUserBalance` avoids duplicating arithmetic across components.

