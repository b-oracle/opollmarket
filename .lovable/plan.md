

## Move Chart Above All Cards

### What changes

**File: `src/pages/Commissions.tsx`**

Reorder the three sections so the layout becomes:

1. **Pie Chart** (collapsible) — currently at lines 567-626
2. **Summary Cards** (Total Earned, Creator, Referral, etc.) — currently at lines 548-565
3. **Balance Cards** (Gift, Bonus, oSURE) — stays at lines 628-680

The fix is simply swapping the Summary Cards block and the Pie Chart block — move the `AnimatePresence` chart section (lines 567-626) above the Summary Cards grid (lines 548-565).

