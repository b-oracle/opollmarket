

## Reorder Cards & Add Info Tooltips on Commissions Page

### What changes

**1. Move balance cards (Gift, Bonus, oSURE) below the summary cards**

Currently the layout is:
- Row 1: Gift Balance, Bonus Balance, oSURE Balance
- Row 2-3: Summary cards (Total Earned, Creator, Referral, Copy Trade, Signup Bonus, Pending)

New layout:
- Row 1-2: Summary cards (Total Earned, Creator, Referral, Copy Trade, Signup Bonus, Pending)
- Row 3: Gift Balance, Bonus Balance, oSURE Balance

**2. Add info dialog/popover on tap for Bonus Balance and oSURE Balance cards**

When a user taps the **Bonus Balance** card, a dialog explains: "Bonus balance is earned from registration rewards and promotions. It can be used to pay for platform services like market creation fees, AI generation costs, and prediction fees. It cannot be used for direct wagers or withdrawals."

When a user taps the **oSURE Balance** card, a dialog explains: "oSURE balance is your prediction protection fund. When you lose a protected prediction, the coverage amount is credited here. Use it on future predictions — it unlocks to your main balance when you win."

Gift Balance already has its own detail dialog, so it stays as-is.

### File to modify

**`src/pages/Commissions.tsx`**
- Swap the two grid sections: move the summary cards grid (lines 626-643) above the balance cards grid (lines 444-478)
- Add `bonusInfoOpen` and `osureInfoOpen` state variables
- Make the Bonus Balance card and oSURE Balance card clickable, opening their respective info dialogs
- Add two simple `Dialog` components with explanatory text for each balance type
- Add "Tap for info ▸" hint text on Bonus and oSURE cards (matching Gift Balance style)

