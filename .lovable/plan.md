## Goal

Stop the crypto Up/Down market detail page from silently spawning/redirecting to the next round on top of itself. Once a round resolves, the page should just show the resolved state with a clear "View active rounds" CTA back to Home. The backend cron continues to spawn the next round normally — users discover it on Home, not via a hijacked URL change.

## Why this fixes the perceived bug

Today, when a round resolves, `MarketDetail` polls every 4s and `navigate(..., { replace: true })` to whichever new active round of the same asset it finds. That makes it look like:
- the market "ends as soon as it starts" (you land on a fresh round whose countdown is just beginning), and
- the URL silently changes under the user, which is also why the deadline / state seemed inconsistent with the card they tapped.

Removing the auto-redirect makes the lifecycle obvious: one URL = one round, start → live → resolved → done.

## Changes (frontend only)

1. **`src/pages/MarketDetail.tsx`**
   - Delete the auto-redirect block: the `REDIRECTED_FROM` module set, `redirectingRef`, and the entire `useEffect` that polls `markets` for the next active round of the same `auto_resolve_asset` and calls `navigate(/market/<nextId>)`.
   - Keep all prefetch helpers only if they're used elsewhere; otherwise drop the now-unused imports (`primeCryptoRoundCache`, `subscribeToPriceStream`, `fetchCryptoPrice`, `fetchMarketDetail`, `mapDbToMarket`, `primeMarketCommentsCache` if exclusive to that effect).
   - Leave the rest of the page (chart, resolution summary, comments) untouched.

2. **`src/components/CryptoRoundStatusTimeline.tsx`**
   - Repurpose the `respawning` / `done` stages: instead of "Next round spawns in ~Ns", show "Round complete" plus a primary button **"View active rounds → Home"** that does `navigate("/")`.
   - Keep the `live → resolving → payout → done` visual timeline; just stop implying a same-page respawn.

3. **(Optional polish) `src/components/quick-trade/MarketClosedOverlay.tsx`** if it currently nudges users to wait for the next round, change the copy to "This round has ended — head to Home to join the next one" with a Home button.

## Out of scope

- No edge-function changes. `crypto-round-spawner`, `check-auto-resolve`, `close-expired-markets`, and the `db_now()` / state-machine guards stay exactly as they are. The cron continues to spawn the next round automatically; this plan only changes how the user discovers it.
- No DB migration.
- Home page (`Index.tsx`) already lists active crypto rounds via `useMarkets`, so nothing to add there.

## Acceptance

- Opening a 5m round shows a 5:00 → 0:00 countdown; URL never changes mid-round.
- After resolution, the same URL shows the resolved chart + summary and a "View active rounds" button. Tapping it lands on Home where the freshly-spawned round is visible as its own card.
- No console polling against `markets` from the detail page after resolution.
