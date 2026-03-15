

## How It Worked Before (Original Model)

Before the tiered creator fee update, the system had **two fee fields** that together formed the total prediction fee:

- **`admin_fee_percent`** (Pool Reserve) — credited to the admin's balance
- **`creator_fee_percent`** (Creator Fee) — a single flat rate credited to the market creator, regardless of verification level

**Total fee = admin + creator**, deducted from every wager. The remainder (`wager - totalFees`) went into the market pool (liquidity).

The tiered update split `creator_fee_percent` into three rates (`no tick`, `blue tick`, `gold tick`), adding complexity and extra DB lookups per trade.

---

## Suggested Better Edit

Instead of reverting to two fields (admin + creator), simplify to a **single "Prediction Fee"** with an optional creator split:

**Option A — Single Fee, No Creator Payout:**
One field: `prediction_fee_percent`. The entire fee goes to the platform. Creators earn via revenue shares (already implemented separately). This is the simplest model.

**Option B — Single Fee + Flat Creator Split:**
One total `prediction_fee_percent` visible to users. Internally, a second field `creator_share_percent` determines what fraction of that fee goes to the creator (same for all tiers). Example: 5% total fee, 60% of that goes to creator = creator gets 3%, platform gets 2%.

### Recommendation: Option A

- Remove `creator_fee_percent`, `creator_fee_blue_percent`, `creator_fee_gold_percent` from the fee flow
- Rename `admin_fee_percent` to simply "Prediction Fee (%)" in the admin UI
- The entire fee goes to the platform admin balance
- Creators still earn through the existing **Revenue Share** system (`distribute-revenue-shares`)
- Removes the per-trade creator profile lookup in `place-bet`, improving performance

### Changes Required

1. **Admin Settings UI** — Replace the 4 fee fields (Pool Reserve + 3 Creator Fees) with a single "Prediction Fee (%)" input
2. **`place-bet` edge function** — Remove creator verification lookup and creator balance credit; charge one flat fee to admin
3. **`BetModal.tsx`** — Use only `admin_fee_percent` for fee display (no `+ creator_fee_percent`)
4. **`copy-trade`, `approve-copy-trade`, `telegram-bot`** — Same simplification
5. **`useCommissionSettings.ts`** — Keep the fields for backward compatibility but they become unused in fee calculation

