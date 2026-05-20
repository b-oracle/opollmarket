## Add BSC Reconciliation panel

Adds a third panel to `/admin/reconciliation` (alongside NOWPayments, Payaza, Flutterwave) for on-chain BSC stablecoin deposits — purely a read/audit view, no balance-changing actions (those already live in `/admin/bsc-review`).

### What it shows

Top summary (last 30 days, with date-range selector):
- Total events detected
- Total credited (count + USD)
- Pending (`detected`, awaiting 12 confs) — count + USD
- Manual review queue — count + USD (with link to `/admin/bsc-review`)
- Reorged/failed (`re-verify` failures) — count
- Scanner cursor (`bsc_deposit_state.last_scanned_block`) + lag vs head

Two tabs:

1. **Events** — table of `bsc_deposit_events` rows
   - Columns: detected_at, user (short id + link to admin user drawer), token, amount_usd, confirmations, status badge, tx_hash (BscScan link), credited_tx_id link
   - Filter by status (all / detected / manual_review / credited / failed)
   - Filter by token (USDT/USDC)
   - Search by tx_hash, user_id, or address
   - Pagination via existing `AdminPagination`

2. **Reconciliation** — join `bsc_deposit_events` (status=credited) ↔ `transactions` via `credited_tx_id`
   - Flags orphan events (credited status but no matching transaction row)
   - Flags transactions with `metadata->>'bsc_event_id'` that point to a missing/non-credited event
   - Flags amount mismatches between event.amount_usd and transaction.amount

### Technical details

**New file:** `src/components/admin/BscReconciliation.tsx`
- Follows the same shape/styling as `NpReconciliation.tsx` (card, header w/ refresh button, summary grid, tabs, sticky-header tables).
- Queries directly via `supabase.from('bsc_deposit_events')` — no edge function needed (RLS already restricts to admins via existing policies; if it doesn't, we add a `has_role('admin')` SELECT policy in a small migration).
- Uses `wagmi`-free BscScan URL builder: `https://bscscan.com/tx/${tx_hash}`.

**Edit:** `src/pages/admin/AdminReconciliation.tsx` — import and render `<BscReconciliation />` below the existing three panels.

**No edge function, no balance mutations** — read-only. All write actions (approve manual_review, mark failed, manually credit) remain in `/admin/bsc-review`. We'll add a "Open in Review Queue →" link from any `manual_review` row.

### Out of scope
- Scanner restart / cursor reset controls (separate ops task)
- CSV export (can add later if needed)
- User-facing wallet panel listing (was option 2, not chosen)
