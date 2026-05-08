# Crypto Up/Down — Go-Live Plan

Five batches, ordered by risk. Each batch is independently shippable so we can stop at any point and the feature is still in a better state than before.

---

## Batch 1 — Visual QA on a live round (no code changes first)

Goal: confirm the new bold header, left-to-right chart, and P&L brackets actually look right mid-round on the 402px viewport.

1. Open an active BTC 5m round in the preview.
2. Verify:
   - Chart line starts flush at the left edge at round-open and advances rightward.
   - 3 timestamp ticks render under the chart without clipping.
   - P&L bracket labels on the left axis don't overlap the y-axis price ticks.
   - Dollar-delta chip (▲ / ▼ $X) updates live.
   - "Condition met!" copy in `LivePriceBadge` reads consistently with the new bold header language.
3. Capture any layout bugs and fix in `SimpleAreaChart.tsx` / `PriceToBeatHeader.tsx`.

## Batch 2 — Edge-case correctness

Files: `QuickTradeBetControls.tsx`, `PriceToBeatHeader.tsx`, `SimpleAreaChart.tsx`.

1. **Empty pools**: when `poolUp + poolDown === 0`, force cents pricing to 50¢/50¢ and payout to "—" instead of dividing by zero.
2. **Resolution swap**: trigger an ended round and verify "Final Price" + WIN/LOSE badge swap renders, with correct green/red color.
3. **Window math guard**: clamp `toX(ts)` so a stale tick after `windowEndMs` can't draw past the right edge.
4. **Bracket overflow**: if user stake is 0, hide P&L brackets entirely (don't render `+ $0` labels).

## Batch 3 — Functional polish

1. **Haptics on Up/Down tap** — wire `@/lib/haptics` `selection()` into `QuickTradeBetControls.tsx` button onClick.
2. **Receipt page** (`src/pages/UpDownReceipt.tsx`) — audit against the new bold visual language; align typography, dollar-delta chip, and win/lose color treatment.
3. **Analytics events** — emit `crypto_round_entered`, `crypto_round_bet_placed`, `crypto_round_resolved_view` via the existing analytics helper (per platform-analytics memory).
4. **BORACLE residue sweep** — `rg -n "BORACLE" src/` and confirm no creator strings leak on Profile / UserProfile / CreatorDashboard / TransactionHistory for crypto rounds.

## Batch 4 — Ops & realtime verification

1. **Spawner cron** — verify `crypto-round-spawner` edge function is on a pg_cron schedule (not just manual). Inspect with `supabase--read_query` against `cron.job`.
2. **Auto-refresh** — confirm Home feed swaps in the next round within ~1s of resolution (the recent `useMarkets` realtime change). Watch network tab for the invalidate.
3. **Resolution push notification** — check `notification_automation` triggers fire for crypto round wins/losses; if not, add to the existing trigger or skip and log as known-gap.
4. **Feature toggle** — confirm `feature_toggles.crypto_up_down` still gates correctly so we can stage the rollout.

## Batch 5 — Pre-publish checks

1. Run `supabase--linter` — fix any new RLS warnings.
2. Run security scan — confirm no new findings tied to crypto round tables.
3. Smoke-test on real mobile (Despia wrapper if available) — bold MM:SS countdown, tap Up/Down, see receipt, confirm push.
4. Ship behind the existing toggle, flip on for a small cohort first.

---

## Technical notes

- `SimpleAreaChart`: clamp formula → `Math.max(0, Math.min(chartW, ((ts - start) / (end - start)) * chartW))`.
- Cents fallback in `QuickTradeBetControls`:
  ```ts
  const total = poolUp + poolDown;
  const upCents = total > 0 ? Math.round((poolDown / total) * 100) : 50;
  ```
  (parimutuel: your share of the *opposite* pool is your implied price).
- Haptics: `import { selection } from "@/lib/haptics"; ... onClick={() => { selection(); originalOnClick(); }}`.
- BORACLE sweep: search must also cover edge functions and any cached `creator_name` columns.

## Out of scope

- Native CallKit/full-screen-call work in `*-native-ref/` — unrelated, stays parked.
- Any change to round spawning cadence, payout math, or fee structure.
- New crypto assets beyond BTC/ETH/SOL.

## Acceptance

Feature is "go-live" when: a real round on mobile renders the bold Polymarket-style UI without layout bugs, edge cases (empty pool, stake=0, post-deadline tick) don't crash the chart, haptics fire on Up/Down, receipt matches the new look, the next round appears automatically on Home, and `crypto-round-spawner` is on cron. Ship behind the existing toggle.
