

## Expandable Transaction Details

### What Changes
Make each transaction row in the Profile page clickable to expand and show additional details. Uses an accordion-style expand/collapse pattern — tapping a row toggles a details panel below it.

### Details Shown (per transaction type)

**Buy/Sell (Predictions):**
- Market title (fetched via `market_id` join)
- Price per share, number of shares
- Side (YES/NO)
- Transaction ID (truncated)
- Full date/time

**Deposit/Withdrawal:**
- Payment ID (if NOWPayments)
- Transaction hash (if available)
- Transaction ID
- Full date/time
- Pending deposits keep existing "tap to view" behavior for the deposit modal

**Payout/Refund/Commission (Earnings):**
- Market title
- Transaction ID
- Full date/time

**Quick Trades:**
- Asset, side, payout amount
- Round details
- Full date/time

### Implementation

**1. Update transaction query in `src/pages/Profile.tsx`**
- Change `select("*")` to `select("*, markets(title)")` to join market titles via the `market_id` foreign key
- This avoids a separate fetch

**2. Add expand state in `src/pages/Profile.tsx`**
- New state: `const [expandedTxId, setExpandedTxId] = useState<string | null>(null)`
- Toggle on row click (unless it's a pending deposit, which keeps its existing modal behavior)

**3. Add expandable detail section to each transaction row**
- Use `AnimatePresence` + `motion.div` for smooth expand/collapse animation
- Show a details grid below the existing row content when expanded
- Add a subtle chevron indicator on rows to signal expandability
- Style the expanded section with a top border separator inside the glass card

### Files Modified
| File | Change |
|------|--------|
| `src/pages/Profile.tsx` | Add expand state, join market titles, render expandable detail panel with animation |

